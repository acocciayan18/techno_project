import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Ban, Inbox, Clock, StickyNote, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useResource } from '../../store/dataStore.js';
import { usePending } from '../../lib/useAsync.js';
import { tapProps } from '../../components/motion.jsx';
import Spinner from '../../components/Spinner.jsx';
import { SkeletonTable } from '../../components/Skeleton.jsx';
import QrDetailDrawer from '../../components/QrDetailDrawer.jsx';
import { notify } from '../../lib/toast.jsx';
import { formatDate } from '../../lib/date.js';

// Dedicated review queue for user-filed activation requests. Approving transfers
// ownership to the requester; rejecting returns the QR to AVAILABLE. Both actions
// hit the admin API (ownership checks enforced server-side) and share the
// `admin/claims` cache key, so the nav notification badge updates in lockstep.
export default function AdminRequests() {
  const [selected, setSelected] = useState(null); // open drawer qrId
  const { run, isPending } = usePending();

  const { data: claims, error: loadError, loading, reload } = useResource(
    'admin/claims',
    () => api.get('/admin/claims').then((r) => r.claims),
  );

  function review(qrId, decision) {
    return run(`${qrId}:${decision}`, async () => {
      try {
        await api.put(`/admin/qr/${qrId}/${decision}`, {});
        await reload();
        notify.success(decision === 'approve' ? `${qrId} approved , ownership transferred.` : `${qrId} rejected , released to stock.`);
      } catch (e) {
        notify.error(e.message);
      }
    });
  }

  const count = claims?.length || 0;

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-[1.1rem]">
        <h1 className="m-0">Activation Requests</h1>
        {count > 0 && (
          <span className="badge badge-amber">{count} pending</span>
        )}
      </div>
      <p className="text-muted text-[.95rem] mt-0 mb-4 max-w-prose">
        Users who can’t use their printed activation code file a request here. Approve to transfer
        ownership to the requester, or reject to release the QR back to available stock.
      </p>

      {loadError && <p className="status-msg status-error">{loadError}</p>}

      {loading && !claims ? (
        <SkeletonTable cols={4} rows={4} />
      ) : !claims ? null : claims.length === 0 ? (
        <div className="card flex flex-col items-center text-center gap-3 py-12">
          <span className="w-12 h-12 grid place-items-center rounded-[12px] bg-surface text-muted"><Inbox size={24} strokeWidth={2} /></span>
          <h2 className="m-0 text-lg">No pending requests</h2>
          <p className="text-muted m-0 max-w-prose">All activation requests have been reviewed. New requests will show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {claims.map((c) => {
            const busy = isPending(`${c.qrId}:approve`) || isPending(`${c.qrId}:reject`);
            return (
              <div key={c.qrId} className="card !mb-0 flex flex-col gap-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <button
                    type="button"
                    className="font-mono font-bold text-base text-ink hover:text-primary cursor-pointer inline-flex items-center gap-1"
                    onClick={() => setSelected(c.qrId)}
                    aria-label={`View ${c.qrId}`}
                  >
                    {c.qrId} <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                  <span className="text-sm text-ink min-w-0 break-words">
                    {c.claimantUsername ? <span className="font-mono">@{c.claimantUsername}</span> : 'Unknown user'}
                    {c.claimantName && <span className="text-muted"> · {c.claimantName}</span>}
                  </span>
                  <span className="text-xs text-muted inline-flex items-center gap-1 ml-auto">
                    <Clock size={13} strokeWidth={2.2} /> {formatDate(c.requestedAt)}
                  </span>
                </div>

                {c.note && (
                  <p className="text-sm text-muted m-0 flex items-start gap-1.5 bg-surface border border-border rounded-xs p-2.5">
                    <StickyNote size={14} strokeWidth={2.2} className="flex-none mt-0.5" />
                    <span className="min-w-0 break-words whitespace-pre-wrap">{c.note}</span>
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  <motion.button
                    className="btn btn-sm btn-success"
                    onClick={() => review(c.qrId, 'approve')}
                    disabled={busy}
                    {...tapProps}
                  >
                    {isPending(`${c.qrId}:approve`) ? <Spinner size={14} /> : <Check size={15} strokeWidth={2.5} />} Approve
                  </motion.button>
                  <motion.button
                    className="btn btn-sm btn-danger"
                    onClick={() => review(c.qrId, 'reject')}
                    disabled={busy}
                    {...tapProps}
                  >
                    {isPending(`${c.qrId}:reject`) ? <Spinner size={14} /> : <Ban size={15} strokeWidth={2.5} />} Reject
                  </motion.button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <QrDetailDrawer qrId={selected} onClose={() => setSelected(null)} onChanged={reload} />
    </div>
  );
}
