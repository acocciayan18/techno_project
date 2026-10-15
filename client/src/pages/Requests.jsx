import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Inbox, Clock, StickyNote, X, Check, Ban, ChevronRight, RotateCcw, Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useResource } from '../store/dataStore.js';
import { usePending } from '../lib/useAsync.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import { SkeletonTable } from '../components/Skeleton.jsx';
import { notify } from '../lib/toast.jsx';

const MotionLink = motion.create(Link);

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

// Visual + copy per request outcome.
const STATUS_META = {
  PENDING: { badge: 'badge-amber', label: 'Pending review', Icon: Clock, tone: 'text-warn', blurb: 'An admin will review this request soon.' },
  APPROVED: { badge: 'badge-green', label: 'Approved', Icon: Check, tone: 'text-success', blurb: 'Approved — this QR code is now yours.' },
  REJECTED: { badge: 'badge-red', label: 'Rejected', Icon: Ban, tone: 'text-danger', blurb: 'This request was declined. You can try activating it again.' },
};

// User-facing view of the activation requests this account has filed: the QR
// codes they asked an admin to activate, across pending / approved / rejected.
// Shares the `owner/claims` resource prefix so any claim change (file / approve /
// reject / cancel) refreshes this page live.
export default function Requests() {
  const { run, isPending } = usePending();
  const confirm = useConfirm();

  const { data: requests, error, loading, reload } = useResource(
    'owner/claims/requests',
    () => api.get('/owner/requests').then((r) => r.requests),
  );

  function cancel(qrId) {
    return confirm({
      title: `Cancel request for ${qrId}?`,
      description: 'This withdraws your pending activation request. The QR code is released and you can request or activate it again later.',
      confirmLabel: 'Cancel request',
      busyLabel: 'Cancelling…',
      variant: 'warning',
      icon: X,
      onConfirm: () =>
        run(qrId, async () => {
          try {
            await api.post(`/owner/qr/${qrId}/cancel-request`, {});
            await reload();
            notify.success(`Request for ${qrId} cancelled.`);
          } catch (e) {
            notify.error(e.message);
            throw e; // keep the confirm modal open on failure
          }
        }),
    });
  }

  const count = requests?.length || 0;
  const pendingCount = requests?.filter((r) => r.requestStatus === 'PENDING').length || 0;

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-[1.1rem]">
        <h1 className="m-0">My Requests</h1>
        {pendingCount > 0 && <span className="badge badge-amber">{pendingCount} pending</span>}
      </div>
      <p className="text-muted text-[.95rem] mt-0 mb-4 max-w-prose">
        Activation requests you’ve filed for QR codes you couldn’t activate with a printed code.
        Track their status here — an admin reviews each one.
      </p>

      {error && <p className="status-msg status-error">{error}</p>}

      {loading && !requests ? (
        <SkeletonTable cols={3} rows={4} />
      ) : !requests ? null : count === 0 ? (
        <div className="card flex flex-col items-center text-center gap-3 py-12">
          <span className="w-12 h-12 grid place-items-center rounded-[12px] bg-surface text-muted"><Inbox size={24} strokeWidth={2} /></span>
          <h2 className="m-0 text-lg">No requests yet</h2>
          <p className="text-muted m-0 max-w-prose">
            When you can’t activate a QR code with its printed code, file a request from the Activate
            page and it’ll show up here.
          </p>
          <MotionLink to="/activate" className="btn btn-primary mt-1" {...tapProps}>
            <Plus size={18} strokeWidth={2.5} /> Activate a code
          </MotionLink>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {requests.map((r) => {
            const meta = STATUS_META[r.requestStatus] || STATUS_META.PENDING;
            const busy = isPending(r.qrId);
            return (
              <div key={r.qrId} className="card !mb-0 flex flex-col gap-3">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="font-mono font-bold text-base text-ink">{r.qrId}</span>
                  <span className={`badge ${meta.badge} ml-auto`}>{meta.label}</span>
                </div>

                <p className={`text-sm m-0 flex items-start gap-1.5 ${meta.tone}`}>
                  <meta.Icon size={15} strokeWidth={2.3} className="flex-none mt-0.5" />
                  <span className="min-w-0">{meta.blurb}</span>
                </p>

                {r.note && (
                  <p className="text-sm text-muted m-0 flex items-start gap-1.5 bg-surface border border-border rounded-xs p-2.5">
                    <StickyNote size={14} strokeWidth={2.2} className="flex-none mt-0.5" />
                    <span className="min-w-0 break-words whitespace-pre-wrap">{r.note}</span>
                  </p>
                )}

                <div className="text-xs text-muted flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1"><Clock size={13} strokeWidth={2.2} /> Requested {fmtDate(r.requestedAt)}</span>
                  {r.decidedAt && <span className="inline-flex items-center gap-1 pl-[1.1rem]">Decided {fmtDate(r.decidedAt)}</span>}
                </div>

                <div className="flex gap-2 flex-wrap mt-auto pt-1">
                  {r.requestStatus === 'PENDING' && (
                    <motion.button className="btn btn-sm btn-ghost !text-danger" onClick={() => cancel(r.qrId)} disabled={busy} {...tapProps}>
                      {busy ? <Spinner size={14} /> : <X size={15} strokeWidth={2.5} />} Cancel request
                    </motion.button>
                  )}
                  {r.requestStatus === 'APPROVED' && r.owned && (
                    <MotionLink to={`/qr/${r.qrId}`} className="btn btn-sm btn-primary" {...tapProps}>
                      Manage item <ChevronRight size={15} strokeWidth={2.5} />
                    </MotionLink>
                  )}
                  {r.requestStatus === 'REJECTED' && (
                    <MotionLink to="/activate" className="btn btn-sm" {...tapProps}>
                      <RotateCcw size={15} strokeWidth={2.5} /> Try again
                    </MotionLink>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
