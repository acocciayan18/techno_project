import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, FileCode, ExternalLink, Power, Printer, Check, Ban, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useResource, useDataStore } from '../store/dataStore.js';
import { usePending } from '../lib/useAsync.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { tapProps } from './motion.jsx';
import Spinner from './Spinner.jsx';
import { Skeleton } from './Skeleton.jsx';
import QrPrintDialog from './QrPrintDialog.jsx';
import { notify } from '../lib/toast.jsx';

const QR_BADGE = { AVAILABLE: 'badge-green', PENDING: 'badge-amber', ACTIVATED: 'badge-blue', DISABLED: 'badge-gray' };
const CLAIM_BADGE = { PENDING: 'badge-amber', APPROVED: 'badge-green', REJECTED: 'badge-red' };
const ITEM_BADGE = { ACTIVE: 'badge-green', LOST: 'badge-red', RECOVERED: 'badge-blue' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border last:border-none">
      <span className="text-muted text-sm flex-none">{label}</span>
      <span className="text-ink text-sm text-right break-words min-w-0">{children}</span>
    </div>
  );
}

// Inner body: only mounted while a QR is selected, so its fetch never fires for
// a closed drawer. Inventory/claim actions route through the admin API and call
// onChanged() so the parent table stays in sync. QR activation and item editing
// belong to the owner (owner routes), so this admin drawer only displays them.
function DrawerBody({ qrId, onChanged, onClose }) {
  const { data, error, loading, reload } = useResource(
    `admin/qr/${qrId}`,
    () => api.get(`/admin/qrcodes/${qrId}`),
  );
  const { run, isPending } = usePending();
  const confirm = useConfirm();
  const [printOpen, setPrintOpen] = useState(false);

  const qr = data?.qr;
  const owner = data?.owner;
  const item = data?.item;
  const claim = data?.claim;

  async function after(promise) {
    await promise;
    await reload();
    onChanged?.();
  }

  function toggleQr() {
    const disabling = qr.status !== 'DISABLED';
    const doToggle = () =>
      run('toggle', async () => {
        const action = disabling ? 'disable' : 'enable';
        try {
          await after(api.put(`/admin/qr/${qrId}/${action}`, {}));
          notify.success(`${qrId} ${disabling ? 'disabled' : 'enabled'}.`);
        } catch (e) {
          notify.error(e.message);
          throw e; // keep the confirm modal open so the error is actionable
        }
      });

    // Re-enabling a QR is non-destructive — act immediately, no prompt.
    if (!disabling) return doToggle();

    // Disabling kills scans of the printed code, so confirm first.
    return confirm({
      title: `Disable ${qrId}?`,
      description:
        'Scanning the printed code stops working and its public page goes dark until you ' +
        'enable it again. The record and its item are kept — this is reversible.',
      confirmLabel: 'Disable QR',
      busyLabel: 'Disabling…',
      variant: 'warning',
      icon: Power,
      onConfirm: doToggle,
    });
  }

  function askDeleteQr() {
    return confirm({
      title: `Delete ${qrId}?`,
      description: (
        <>
          <span className="font-mono">{qrId}</span> and its item, customization and contact
          settings are removed for good, and any printed sticker goes dead.{' '}
          <strong className="text-ink">This can’t be undone.</strong>
        </>
      ),
      confirmLabel: 'Delete permanently',
      busyLabel: 'Deleting…',
      variant: 'danger',
      icon: Trash2,
      onConfirm: async () => {
        try {
          await api.del(`/admin/qr/${qrId}`);
          useDataStore.getState().fetch('admin/claims', () => api.get('/admin/claims').then((r) => r.claims));
          onChanged?.();
          notify.success(`${qrId} deleted.`);
          onClose?.();
        } catch (e) {
          notify.error(e.message);
          throw e; // keep the modal open on failure
        }
      },
    });
  }

  function reviewClaim(decision) {
    return run(decision, async () => {
      try {
        await after(api.put(`/admin/qr/${qrId}/${decision}`, {}));
        // Refetch the pending-requests queue so the nav badge + Requests page stay
        // in sync no matter where the review was triggered from. (Refetch, not just
        // invalidate: the badge's hook won't re-request on its own.)
        useDataStore.getState().fetch('admin/claims', () => api.get('/admin/claims').then((r) => r.claims));
        notify.success(decision === 'approve' ? `${qrId} approved — ownership transferred.` : `${qrId} rejected — released to stock.`);
      } catch (e) {
        notify.error(e.message);
      }
    });
  }

  if (error && !data) return <p className="status-msg status-error">{error}</p>;
  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="w-[180px] h-[180px] mx-auto" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-10 w-full mt-2" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* QR image + downloads */}
      <div className="card !mb-0 text-center">
        <img
          className="w-[180px] max-w-full border border-border rounded-sm bg-white p-2 mx-auto"
          src={`/api/qr/${qrId}/image.png`}
          alt={`QR ${qrId}`}
        />
        <div className="flex gap-[.5rem] flex-wrap items-center justify-center mt-3">
          <a className="btn btn-sm" href={`/api/qr/${qrId}/image.png`} download={`${qrId}.png`}>
            <Download size={15} strokeWidth={2.5} /> PNG
          </a>
          <a className="btn btn-sm" href={`/api/qr/${qrId}/image.svg`} download={`${qrId}.svg`}>
            <FileCode size={15} strokeWidth={2.5} /> SVG
          </a>
          <motion.button className="btn btn-sm" onClick={() => setPrintOpen(true)} {...tapProps}>
            <Printer size={15} strokeWidth={2.5} /> Print
          </motion.button>
          <a className="btn btn-sm" href={`/q/${qrId}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} strokeWidth={2.5} /> Public
          </a>
        </div>
      </div>

      {printOpen && <QrPrintDialog qrIds={[qrId]} onClose={() => setPrintOpen(false)} />}

      {/* QR record */}
      <div>
        <h3 className="text-sm uppercase tracking-wide text-muted mb-1">QR code</h3>
        <div className="card !mb-0 !py-1">
          <Row label="Status">
            <span className={`badge ${QR_BADGE[qr.status] || 'badge-gray'}`}>{qr.status}</span>
          </Row>
          <Row label="Created">{fmtDate(qr.createdAt)}</Row>
          <Row label="Activated">{fmtDate(qr.activatedAt)}</Row>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          <motion.button
            className={`btn btn-sm ${qr.status === 'DISABLED' ? 'btn-success' : 'btn-danger'}`}
            onClick={toggleQr}
            disabled={isPending('toggle')}
            {...tapProps}
          >
            {isPending('toggle') ? <Spinner size={14} /> : <Power size={15} strokeWidth={2.5} />}
            {qr.status === 'DISABLED' ? 'Enable QR' : 'Disable QR'}
          </motion.button>
          <motion.button
            className="btn btn-sm btn-ghost !text-danger"
            onClick={askDeleteQr}
            {...tapProps}
          >
            <Trash2 size={15} strokeWidth={2.5} /> Delete
          </motion.button>
        </div>
      </div>

      {/* Activation & claims */}
      <div>
        <h3 className="text-sm uppercase tracking-wide text-muted mb-1">Activation</h3>
        <div className="card !mb-0 !py-1">
          {claim ? (
            <>
              <Row label="Claim status">
                <span className={`badge ${CLAIM_BADGE[claim.status] || 'badge-gray'}`}>{claim.status}</span>
              </Row>
              {claim.claimantUsername && <Row label="Requested by"><span className="font-mono">@{claim.claimantUsername}</span></Row>}
              {claim.method && <Row label="Method">{claim.method}</Row>}
              {claim.note && <Row label="Note">{claim.note}</Row>}
              <Row label="Requested">{fmtDate(claim.requestedAt)}</Row>
              {claim.decidedAt && <Row label="Decided">{fmtDate(claim.decidedAt)}</Row>}
            </>
          ) : (
            <p className="text-muted text-sm py-2 m-0">
              {qr.status === 'ACTIVATED' ? 'Activated before claim tracking.' : 'No activation request yet.'}
            </p>
          )}
        </div>

        {/* Approve / reject a pending request. */}
        {qr.status === 'PENDING' && (
          <div className="flex gap-2 flex-wrap mt-3">
            <motion.button className="btn btn-sm btn-success" onClick={() => reviewClaim('approve')} disabled={isPending('approve') || isPending('reject')} {...tapProps}>
              {isPending('approve') ? <Spinner size={14} /> : <Check size={15} strokeWidth={2.5} />} Approve claim
            </motion.button>
            <motion.button className="btn btn-sm btn-danger" onClick={() => reviewClaim('reject')} disabled={isPending('approve') || isPending('reject')} {...tapProps}>
              {isPending('reject') ? <Spinner size={14} /> : <Ban size={15} strokeWidth={2.5} />} Reject
            </motion.button>
          </div>
        )}
      </div>

      {/* Owner */}
      <div>
        <h3 className="text-sm uppercase tracking-wide text-muted mb-1">Owner</h3>
        <div className="card !mb-0 !py-1">
          {owner ? (
            <>
              <Row label="Username"><span className="font-mono">@{owner.username}</span></Row>
              <Row label="Name">{owner.name || '—'}</Row>
              <Row label="Account">
                <span className={`badge ${owner.disabled ? 'badge-red' : 'badge-green'}`}>
                  {owner.disabled ? 'Disabled' : 'Active'}
                </span>
              </Row>
            </>
          ) : (
            <p className="text-muted text-sm py-2 m-0">Not activated — no owner assigned.</p>
          )}
        </div>
      </div>

      {/* Item — read-only. The owner manages item details and lost/found status. */}
      <div>
        <h3 className="text-sm uppercase tracking-wide text-muted mb-1">Item</h3>

        {!item ? (
          <div className="card !mb-0">
            <p className="text-muted text-sm m-0">No item registered on this QR yet.</p>
          </div>
        ) : (
          <div className="card !mb-0 !py-1">
            <Row label="Name">{item.name || '—'}</Row>
            <Row label="Category">{item.category || '—'}</Row>
            <Row label="Description">{item.description || '—'}</Row>
            <Row label="Item status">
              <span className={`badge ${ITEM_BADGE[item.status] || 'badge-gray'}`}>{item.status}</span>
            </Row>
            <Row label="Updated">{fmtDate(item.updatedAt)}</Row>
          </div>
        )}
      </div>
    </div>
  );
}

// Slide-over shell. `qrId` null = closed; the fetching body only mounts while open.
export default function QrDetailDrawer({ qrId, onClose, onChanged }) {
  useEffect(() => {
    if (!qrId) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Lock background scroll so the page behind doesn't move while the drawer scrolls.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [qrId, onClose]);

  // Portal to <body>: the app's <main> is `relative z-[1]`, which traps any fixed
  // child in its own stacking context *below* the mobile bottom nav (z-60, a sibling
  // of main). Rendered inline, the drawer's lower area would be painted over by that
  // nav; escaping to the body lets its z-70/71 layers sit above everything.
  return createPortal(
    <AnimatePresence>
      {qrId && (
        <>
          <motion.div
            key="qr-drawer-backdrop"
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            key="qr-drawer-panel"
            className="fixed right-0 top-0 bottom-0 z-[71] w-full max-w-[480px] bg-bg border-l border-border shadow-brutal-sm overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label={`QR ${qrId} details`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-4 bg-bg/90 backdrop-blur-lg border-b border-border">
              <h2 className="font-mono text-lg font-bold m-0">{qrId}</h2>
              <motion.button
                className="w-9 h-9 grid place-items-center rounded-xs text-muted border border-border bg-card hover:bg-surface hover:text-ink transition-colors cursor-pointer"
                onClick={onClose}
                whileTap={{ scale: 0.95 }}
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.5} />
              </motion.button>
            </div>
            <div className="px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
              <DrawerBody qrId={qrId} onChanged={onChanged} onClose={onClose} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
