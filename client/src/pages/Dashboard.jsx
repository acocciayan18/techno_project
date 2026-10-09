import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, QrCode, Flag, Check, Package, Boxes, Users, List, Clock, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { assetUrl } from '../lib/config.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useResource } from '../store/dataStore.js';
import { usePending } from '../lib/useAsync.js';
import { tapProps, fadeUp } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import { SkeletonStats, SkeletonCards } from '../components/Skeleton.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { notify } from '../lib/toast.jsx';

const MotionLink = motion.create(Link);
const ITEM_BADGE = { ACTIVE: 'badge-green', LOST: 'badge-red', RECOVERED: 'badge-blue' };
const STATUS_MSG = { LOST: 'Marked as lost.', RECOVERED: 'Marked as found.', ACTIVE: 'Reset to active.' };

// Tag UI Kit stat tile: coloured icon chip, big tabular number, muted label.
// `.stat-body` reflows via a container query (see index.css) — icon-beside-value
// when the tile is wide, stacked when it isn't.
const TONES = {
  accent: 'bg-accent-weak text-primary',
  warn: 'bg-warn-weak text-warn',
  success: 'bg-success-weak text-success',
  info: 'bg-info-weak text-info',
  gray: 'bg-surface text-muted',
};
function Stat({ label, value, icon: IconCmp, tone = 'gray' }) {
  return (
    <div className="stat">
      <div className="stat-body">
        {IconCmp && (
          <span className={`stat-ic ${TONES[tone] || TONES.gray}`}>
            <IconCmp size={17} strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <div className="stat-v">{value}</div>
          <div className="stat-l">{label}</div>
        </div>
      </div>
    </div>
  );
}

// One label/number line in a breakdown list — dividers instead of boxes keeps
// the secondary metrics quiet. Actionable counts (pending, lost) go amber.
function BreakRow({ label, value, attention }) {
  const hot = attention && value > 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-[.88rem] text-muted">{label}</span>
      <span className={`text-[.95rem] font-semibold tabular-nums ${hot ? 'text-warn' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

const MGMT = [
  { to: '/inventory', icon: Boxes, label: 'QR Inventory', desc: 'Generate, assign & disable codes' },
  { to: '/users', icon: Users, label: 'User Management', desc: 'Accounts & registrations' },
  { to: '/items', icon: List, label: 'Item Management', desc: 'Every registered item & status' },
];

// Admin-only block: a few headline numbers, quiet breakdowns, and quick links
// into the management pages — detail lives on those pages, not here.
function AdminOverview() {
  const { data: stats, error, loading } = useResource('admin/stats', () => api.get('/admin/stats'));

  if (error && !stats) return <p className="status-msg status-error">{error}</p>;

  return (
    <section className="mb-8 pb-8 border-b border-border">
      <h2 className="mb-4">System overview</h2>

      {loading && !stats ? (
        <SkeletonStats count={4} className="mb-6" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="QR codes" value={stats.qr.total} icon={QrCode} tone="accent" />
          <Stat label="Activated" value={stats.qr.activated} icon={Check} tone="success" />
          <Stat label="Items tracked" value={stats.items.total} icon={Package} tone="info" />
          <Stat label="Registered users" value={stats.users} icon={Users} tone="accent" />
        </div>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded border border-border bg-card shadow-brutal-sm p-4 sm:p-5">
            <h3 className="!mt-0 mb-1">QR codes</h3>
            <BreakRow label="Available" value={stats.qr.available} />
            <BreakRow label="Pending approval" value={stats.qr.pending ?? 0} attention />
            <BreakRow label="Activated" value={stats.qr.activated} />
            <BreakRow label="Disabled" value={stats.qr.disabled} />
          </div>

          <div className="rounded border border-border bg-card shadow-brutal-sm p-4 sm:p-5">
            <h3 className="!mt-0 mb-1">Items</h3>
            <BreakRow label="Active" value={stats.items.active} />
            <BreakRow label="Reported lost" value={stats.items.lost} attention />
            <BreakRow label="Recovered" value={stats.items.recovered} />
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <h3 className="!mt-0 mb-1">Manage</h3>
            <nav className="rounded border border-border bg-card overflow-hidden shadow-brutal-sm">
              {MGMT.map(({ to, icon: IconCmp, label, desc }) => (
                <Link
                  key={to}
                  to={to}
                  className="group flex items-center gap-3 px-3.5 py-3 border-b border-border last:border-0 hover:bg-surface hover:no-underline transition-colors"
                >
                  <span className="w-9 h-9 flex-none grid place-items-center rounded-[9px] bg-accent-weak text-primary">
                    <IconCmp size={17} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink text-[.92rem] leading-tight">{label}</span>
                    <span className="block text-[.78rem] text-muted truncate">{desc}</span>
                  </span>
                  <ChevronRight size={17} strokeWidth={2} className="flex-none text-muted-2 group-hover:text-ink transition-colors" />
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const firstName = (user?.name || user?.username || '').split(/[\s@]/)[0];
  const { data: qrcodes, error, loading, reload } = useResource('owner/qrcodes', () => api.get('/owner/qrcodes').then((r) => r.qrcodes));
  const { data: claims } = useResource('owner/claims', () => api.get('/owner/claims').then((r) => r.claims));
  const { run, isPending } = usePending();

  function changeStatus(qrId, status) {
    return run(qrId, async () => {
      try {
        await api.put(`/owner/items/${qrId}/status`, { status });
        await reload();
        notify.success(STATUS_MSG[status] || 'Status updated.');
      } catch (err) {
        notify.error(err.message);
      }
    });
  }

  // Owner summary derived from the codes we already have — no extra request.
  const list = qrcodes || [];
  const counts = {
    active: list.filter((q) => q.item?.status === 'ACTIVE').length,
    lost: list.filter((q) => q.item?.status === 'LOST').length,
    recovered: list.filter((q) => q.item?.status === 'RECOVERED').length,
  };

  return (
    <div>
      <div className="flex flex-row justify-between items-start gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="min-w-0">
          <h1 className="truncate">Hi, {firstName || 'there'}</h1>
          <p className="text-muted text-[.95rem] m-0">
            {isAdmin ? 'System status and your codes at a glance.' : 'Here’s what needs you.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-none">
          {/* The desktop top bar already carries the bell; on mobile (no top bar)
              it lives here so finder reports are reachable from the dashboard. */}
          <span className="md:hidden"><NotificationBell /></span>
          <MotionLink className="btn btn-primary justify-center" to="/activate" {...tapProps}>
            <Plus size={18} strokeWidth={2.5} /> Activate
          </MotionLink>
        </div>
      </div>

      {isAdmin && <AdminOverview />}

      {claims && claims.length > 0 && (
        <div className="card !mb-6 !border-warn">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={17} strokeWidth={2.2} className="text-warn" />
            <h3 className="!mt-0 m-0 text-base">Awaiting admin approval</h3>
          </div>
          <div className="flex flex-col gap-1.5">
            {claims.map((c) => (
              <div key={c.qrId} className="flex items-center justify-between gap-3 text-sm border-b border-border last:border-none py-1.5">
                <span className="font-mono font-semibold">{c.qrId}</span>
                <span className="badge badge-amber">PENDING</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2>My QR codes</h2>
        {qrcodes && qrcodes.length > 0 && (
          <span className="text-[.82rem] font-semibold text-muted tabular-nums">{list.length} total</span>
        )}
      </div>

      {qrcodes && qrcodes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="Total codes" value={list.length} icon={Boxes} tone="accent" />
          <Stat label="Active" value={counts.active} icon={Check} tone="success" />
          <Stat label="Reported lost" value={counts.lost} icon={Flag} tone="warn" />
          <Stat label="Recovered" value={counts.recovered} icon={Package} tone="info" />
        </div>
      )}

      {error && <p className="status-msg status-error">{error}</p>}
      {!error && !qrcodes && <SkeletonCards count={6} />}

      {qrcodes && qrcodes.length === 0 && (
        <div className="card text-center flex flex-col items-center gap-3 py-8">
          <span className="w-12 h-12 grid place-items-center rounded-[12px] bg-accent-weak text-primary"><QrCode size={24} strokeWidth={2} /></span>
          <p className="text-muted m-0">You have no QR codes yet.</p>
          <MotionLink className="btn btn-primary" to="/activate" {...tapProps}>Activate your first QR</MotionLink>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {list.map((qr, i) => {
          const item = qr.item;
          const itemStatus = item?.status;
          return (
            <motion.div
              className="card flex flex-col cursor-pointer"
              key={qr.qrId}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3 }}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/qr/${qr.qrId}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/qr/${qr.qrId}`); }}
            >
              <div className="flex justify-between items-center mb-2.5 gap-2">
                <span className="font-mono font-semibold text-[.82rem] bg-surface border border-border rounded-xs px-2 py-1">{qr.qrId}</span>
                <span className={`badge ${ITEM_BADGE[itemStatus] || 'badge-gray'}`}>
                  {item ? itemStatus : 'NO ITEM'}
                </span>
              </div>
              {item?.photoUrl ? (
                <img className="w-full h-[150px] object-cover rounded-sm bg-surface border border-border" src={assetUrl(item.photoUrl)} alt="" />
              ) : (
                <div className="w-full h-[150px] rounded-sm border border-border grid place-items-center text-muted-2"
                     style={{ background: 'linear-gradient(135deg, rgb(var(--surface-3)), rgb(var(--surface)))' }}>
                  {item ? <Package size={32} strokeWidth={1.75} /> : <Plus size={32} strokeWidth={1.75} />}
                </div>
              )}
              <div className={`font-display font-semibold mt-3 mb-3 text-[1.05rem] leading-snug truncate ${item?.name ? 'text-ink' : 'text-muted-2'}`}>{item?.name || 'No item registered'}</div>

              <div className="flex flex-wrap gap-[.45rem] mt-auto pt-0.5" onClick={(e) => e.stopPropagation()}>
                <Link className="btn btn-sm" to={`/qr/${qr.qrId}/item`}>{item ? 'Edit item & page' : 'Register item'}</Link>
                {item && itemStatus !== 'LOST' && (
                  <motion.button className="btn btn-sm btn-danger" onClick={() => changeStatus(qr.qrId, 'LOST')} disabled={isPending(qr.qrId)} {...tapProps}>
                    {isPending(qr.qrId) && <Spinner size={14} />} Mark as Lost
                  </motion.button>
                )}
                {item && itemStatus === 'LOST' && (
                  <motion.button className="btn btn-sm btn-success" onClick={() => changeStatus(qr.qrId, 'RECOVERED')} disabled={isPending(qr.qrId)} {...tapProps}>
                    {isPending(qr.qrId) && <Spinner size={14} />} Mark as Found
                  </motion.button>
                )}
                {item && itemStatus === 'RECOVERED' && (
                  <motion.button className="btn btn-sm" onClick={() => changeStatus(qr.qrId, 'ACTIVE')} disabled={isPending(qr.qrId)} {...tapProps}>
                    {isPending(qr.qrId) && <Spinner size={14} />} Reset to Active
                  </motion.button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
