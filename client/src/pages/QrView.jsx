import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, FileCode, ExternalLink, ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useResource, useDataStore } from '../store/dataStore.js';
import { usePending } from '../lib/useAsync.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { notify } from '../lib/toast.jsx';

const BADGE = { ACTIVE: 'badge-green', LOST: 'badge-red', RECOVERED: 'badge-blue' };
// Confirmation line per new item status, shared by QrView + Dashboard tone.
const STATUS_MSG = { LOST: 'Marked as lost.', RECOVERED: 'Marked as found.', ACTIVE: 'Reset to active.' };

export default function QrView() {
  const { qrId } = useParams();
  const { data, error, loading, reload } = useResource(`qr/${qrId}`, () => Promise.all([
    api.get(`/owner/items/${qrId}`),
    api.get(`/qr/${qrId}/url`, { auth: false }),
  ]).then(([a, b]) => ({ item: a.item, url: b.url })));
  const item = data?.item ?? null;
  const url = data?.url || '';
  const { run, isPending } = usePending();
  const confirm = useConfirm();
  const navigate = useNavigate();

  // Owner deletes (releases) their own QR. Blocked while LOST — guard here so the
  // user gets an answer without a round-trip; the backend enforces it regardless.
  function askDelete() {
    if (item?.status === 'LOST') {
      notify.warning('Mark this item as found or active before deleting its QR code.');
      return;
    }
    return confirm({
      title: `Delete ${qrId}?`,
      description: (
        <>
          Your item details, page customization and contact info for{' '}
          <span className="font-mono">{qrId}</span> are removed for good. The code itself is
          released — you can activate it again later with its printed code.{' '}
          <strong className="text-ink">This can’t be undone.</strong>
        </>
      ),
      confirmLabel: 'Delete QR code',
      busyLabel: 'Deleting…',
      variant: 'danger',
      icon: Trash2,
      onConfirm: async () => {
        try {
          await api.del(`/owner/qr/${qrId}`);
          const store = useDataStore.getState();
          store.invalidate('owner/qrcodes');
          store.invalidate('owner/claims');
          store.invalidate(`qr/${qrId}`);
          store.invalidate(`manage/${qrId}`);
          notify.success(`${qrId} deleted.`);
          navigate('/dashboard');
        } catch (err) {
          notify.error(err.message);
          throw err; // keep the confirm modal open so the user can retry
        }
      },
    });
  }

  function changeStatus(status) {
    return run('status', async () => {
      try {
        await api.put(`/owner/items/${qrId}/status`, { status });
        await reload();
        notify.success(STATUS_MSG[status] || 'Status updated.');
      } catch (err) {
        notify.error(err.message);
      }
    });
  }

  if (error && !data) return <p className="status-msg status-error">{error}</p>;
  if (loading && !data) return (
    <div>
      <div className="mb-[1.1rem]">
        <div className="flex justify-between items-center gap-4">
          <Skeleton className="h-9 w-20 !rounded-xs" />
          <Skeleton className="h-5 w-16 !rounded-full" />
        </div>
        <Skeleton className="h-8 w-32 mt-2.5" />
      </div>
      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        <div className="card text-center flex flex-col items-center gap-3">
          <Skeleton className="w-[220px] h-[220px] max-w-full" />
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-[.6rem] flex-wrap justify-center">
            <Skeleton className="h-9 w-20 !rounded-xs" />
            <Skeleton className="h-9 w-20 !rounded-xs" />
            <Skeleton className="h-9 w-36 !rounded-xs" />
          </div>
        </div>
        <div className="card">
          <Skeleton className="h-6 w-40 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3 mb-4" />
          <div className="flex gap-[.45rem] flex-wrap">
            <Skeleton className="h-9 w-24 !rounded-xs" />
            <Skeleton className="h-9 w-28 !rounded-xs" />
          </div>
        </div>
      </div>
    </div>
  );

  const status = item?.status;

  return (
    <div>
      <div className="mb-[1.1rem]">
        <div className="flex justify-between items-center gap-4">
          <Link className="btn btn-ghost btn-sm self-start" to="/dashboard"><ArrowLeft size={16} strokeWidth={2.5} /> Back</Link>
          {item && <span className={`badge ${BADGE[status] || 'badge-gray'}`}>{status}</span>}
        </div>
        <h1 className="mt-2.5">{qrId}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        <div className="card text-center flex flex-col items-center gap-4">
          <img className="w-[220px] max-w-full border border-border rounded-sm bg-white p-2 mx-auto" src={`/api/qr/${qrId}/image.png`} alt={`QR ${qrId}`} />
          <p className="text-muted text-[.85rem] break-all">{url}</p>
          <div className="flex gap-[.6rem] flex-wrap items-center justify-center">
            <a className="btn btn-sm" href={`/api/qr/${qrId}/image.png`} download={`${qrId}.png`}><Download size={16} strokeWidth={2.5} /> PNG</a>
            <a className="btn btn-sm" href={`/api/qr/${qrId}/image.svg`} download={`${qrId}.svg`}><FileCode size={16} strokeWidth={2.5} /> SVG</a>
            <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} strokeWidth={2.5} /> Open public page</a>
          </div>
        </div>

        <div className="card">
          <h3 className="break-words">{item?.name || 'No item registered yet'}</h3>
          {item?.category && <div className="chip-gold max-w-full truncate align-bottom">{item.category}</div>}
          {item?.description && <p className="break-words whitespace-pre-wrap">{item.description}</p>}
          {!item && <p className="text-muted">Register an item so finders know what this QR protects.</p>}

          <div className="flex flex-wrap gap-[.45rem] mt-3">
            <Link className="btn btn-sm" to={`/qr/${qrId}/item`}>{item ? 'Edit item & page' : 'Register item'}</Link>
            {item && status !== 'LOST' && (
              <motion.button className="btn btn-sm btn-danger" onClick={() => changeStatus('LOST')} disabled={isPending('status')} {...tapProps}>
                {isPending('status') && <Spinner size={14} />} Mark as Lost
              </motion.button>
            )}
            {item && status === 'LOST' && (
              <motion.button className="btn btn-sm btn-success" onClick={() => changeStatus('RECOVERED')} disabled={isPending('status')} {...tapProps}>
                {isPending('status') && <Spinner size={14} />} Mark as Found
              </motion.button>
            )}
            {item && status === 'RECOVERED' && (
              <motion.button className="btn btn-sm" onClick={() => changeStatus('ACTIVE')} disabled={isPending('status')} {...tapProps}>
                {isPending('status') && <Spinner size={14} />} Reset to Active
              </motion.button>
            )}
            <motion.button
              className="btn btn-sm btn-ghost !text-danger"
              onClick={askDelete}
              disabled={status === 'LOST'}
              title={status === 'LOST' ? 'Mark the item found before deleting' : 'Delete this QR code'}
              {...tapProps}
            >
              <Trash2 size={15} strokeWidth={2.5} /> Delete
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
