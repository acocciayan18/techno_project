import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, QrCode, Flag, Check, Package, Boxes, Users, List, Clock, ChevronRight, ListChecks, Trash2, Search, X, PackageSearch, Filter } from 'lucide-react';
import { api } from '../lib/api.js';
import { assetUrl } from '../lib/config.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useResource, useDataStore } from '../store/dataStore.js';
import { usePending } from '../lib/useAsync.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { tapProps, fadeUp } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import { SkeletonStats, SkeletonCards } from '../components/Skeleton.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { useNotifications, relativeTime } from '../lib/useNotifications.js';
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

// Status filters for the owner's QR grid. `match` runs against a card's item.
const FILTERS = [
  { key: 'ALL', label: 'All', match: () => true },
  { key: 'ACTIVE', label: 'Active', match: (q) => q.item?.status === 'ACTIVE' },
  { key: 'LOST', label: 'Lost', match: (q) => q.item?.status === 'LOST' },
  { key: 'RECOVERED', label: 'Recovered', match: (q) => q.item?.status === 'RECOVERED' },
  { key: 'NONE', label: 'No item', match: (q) => !q.item },
];

// Recent finder reports, surfaced inline on the dashboard. Same data as the nav
// bell, but shown at a glance here — the latest sightings of the owner's items,
// newest first. Renders nothing when there's no activity.
function RecentActivity() {
  const { list } = useNotifications();
  const recent = list.slice(0, 4);
  if (recent.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3">Recent activity</h2>
      <div className="card !mb-0 !p-0 divide-y divide-border overflow-hidden">
        {recent.map((n) => (
          <Link
            key={n.id}
            to={`/qr/${n.qrId}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface hover:no-underline transition-colors"
          >
            <span className={`flex-none w-9 h-9 grid place-items-center rounded-[9px] ${n.read ? 'bg-surface text-muted' : 'bg-warn-weak text-warn'}`}>
              <PackageSearch size={17} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[.9rem] leading-snug text-ink break-words">
                Someone reported finding <strong className="font-semibold">{n.itemName || 'your item'}</strong>.
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-[.72rem] text-muted-2">
                <span className="font-mono font-semibold bg-surface border border-border rounded-xs px-1.5 py-0.5">{n.qrId}</span>
                <span title={n.createdAt || ''}>{relativeTime(n.createdAt)}</span>
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2} className="flex-none text-muted-2" />
          </Link>
        ))}
      </div>
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
  const confirm = useConfirm();

  // Multi-select + bulk actions over the owner's own registered QR codes.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Search + status filter over the grid (client-side; the summary tiles stay
  // global so the headline counts never shift as you filter).
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

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

  // Codes that survive the active search + status filter — what the grid renders
  // and what the bulk actions operate on.
  const q = query.trim().toLowerCase();
  const activeFilter = FILTERS.find((f) => f.key === statusFilter) || FILTERS[0];
  const visible = list.filter(
    (qr) => activeFilter.match(qr) && (!q || qr.qrId.toLowerCase().includes(q) || (qr.item?.name || '').toLowerCase().includes(q)),
  );
  const filtering = q !== '' || statusFilter !== 'ALL';

  // ---- Bulk selection ---- (scoped to the visible/filtered codes)
  const selectedList = list.filter((qr) => selected.has(qr.qrId));
  const allSelected = visible.length > 0 && visible.every((qr) => selected.has(qr.qrId));

  function toggleOne(qrId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(qrId) ? next.delete(qrId) : next.add(qrId);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      // If every visible code is already selected, clear them; otherwise add them all.
      const everyVisible = visible.length > 0 && visible.every((qr) => prev.has(qr.qrId));
      const next = new Set(prev);
      visible.forEach((qr) => (everyVisible ? next.delete(qr.qrId) : next.add(qr.qrId)));
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Run one owner endpoint across many QRs. Partial failure is tolerated (each QR
  // is independent and re-validated server-side) and summarized in one toast.
  async function applyBulk({ ids, action, verb }) {
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => action(id)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    await reload();
    const store = useDataStore.getState();
    store.invalidate('owner/claims');
    ids.forEach((id) => { store.invalidate(`qr/${id}`); store.invalidate(`manage/${id}`); });
    setBulkBusy(false);
    exitSelect();
    if (ok && failed) notify.warning(`${ok} ${verb}, ${failed} failed.`);
    else if (ok) notify.success(`${ok} QR${ok === 1 ? '' : 's'} ${verb}.`);
    else notify.error('Could not update the selected codes.');
  }

  function bulkMarkLost() {
    const ids = selectedList.filter((q) => q.item && q.item.status !== 'LOST').map((q) => q.qrId);
    if (!ids.length) { notify.warning('None of the selected codes have an item that can be marked lost.'); return; }
    return confirm({
      title: `Mark ${ids.length} item${ids.length === 1 ? '' : 's'} as lost?`,
      description: 'Their public finder pages go live so anyone who scans can help return them. Selected codes without an item are skipped.',
      confirmLabel: 'Mark as lost',
      busyLabel: 'Updating…',
      variant: 'warning',
      icon: Flag,
      onConfirm: () => applyBulk({ ids, action: (id) => api.put(`/owner/items/${id}/status`, { status: 'LOST' }), verb: 'marked lost' }),
    });
  }

  function bulkMarkFound() {
    const ids = selectedList.filter((q) => q.item?.status === 'LOST').map((q) => q.qrId);
    if (!ids.length) { notify.warning('None of the selected codes are currently reported lost.'); return; }
    return applyBulk({ ids, action: (id) => api.put(`/owner/items/${id}/status`, { status: 'RECOVERED' }), verb: 'marked found' });
  }

  function bulkDelete() {
    const ids = selectedList.filter((q) => q.item?.status !== 'LOST').map((q) => q.qrId);
    const skipped = selected.size - ids.length;
    if (!ids.length) { notify.warning('Mark lost items as found before deleting their codes.'); return; }
    return confirm({
      title: `Delete ${ids.length} QR code${ids.length === 1 ? '' : 's'}?`,
      description: (
        <>
          Item details, page customization and contact info are removed for good. The codes return to
          unused and can be activated again later with their printed code.
          {skipped > 0 && <> {skipped} lost item{skipped === 1 ? '' : 's'} will be skipped.</>}{' '}
          <strong className="text-ink">This can’t be undone.</strong>
        </>
      ),
      confirmLabel: 'Delete codes',
      busyLabel: 'Deleting…',
      variant: 'danger',
      icon: Trash2,
      onConfirm: () => applyBulk({ ids, action: (id) => api.del(`/owner/qr/${id}`), verb: 'deleted' }),
    });
  }

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

      <RecentActivity />

      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="m-0">My QR codes</h2>
        {qrcodes && qrcodes.length > 0 && (
          <span className="text-[.82rem] font-semibold text-muted tabular-nums flex-none">{list.length} total</span>
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

      {/* Unified toolbar: selection toggle, search, and status filter grouped in
          one row. Client-side over the owner's own codes; the summary tiles above
          stay global so headline counts never shift. Stacks on mobile. */}
      {qrcodes && qrcodes.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-4">
          <label className="inp-icon flex-1 min-w-0" aria-label="Search your QR codes">
            <Search />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or item name…"
              className="!mt-0"
            />
            {query && (
              <button
                type="button"
                className="inp-trail text-muted-2 hover:text-ink"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            )}
          </label>
          <div className="flex gap-2.5">
            <label className="inp-icon flex-1 sm:flex-none sm:w-44 min-w-0" aria-label="Filter by status">
              <Filter />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="!mt-0"
              >
                {FILTERS.map((f) => {
                  const n = f.key === 'ALL' ? list.length : list.filter(f.match).length;
                  return (
                    <option key={f.key} value={f.key}>
                      {f.label} ({n})
                    </option>
                  );
                })}
              </select>
            </label>
            <motion.button
              type="button"
              className={`btn flex-none ${selectMode ? 'btn-primary' : ''}`}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              {...tapProps}
            >
              <ListChecks size={16} strokeWidth={2.5} /> {selectMode ? 'Done' : 'Select'}
            </motion.button>
          </div>
        </div>
      )}

      {/* Bulk action bar — visible in select mode; actions apply to the checked codes. */}
      {selectMode && qrcodes && qrcodes.length > 0 && (
        <div className="card !mb-4 flex items-center gap-3 flex-wrap !py-3">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all QR codes" />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          {bulkBusy && <Spinner size={16} />}
          <div className="flex gap-2 ml-auto flex-wrap">
            <motion.button className="btn btn-sm btn-danger" onClick={bulkMarkLost} disabled={selected.size === 0 || bulkBusy} {...tapProps}>
              <Flag size={15} strokeWidth={2.5} /> Mark lost
            </motion.button>
            <motion.button className="btn btn-sm btn-success" onClick={bulkMarkFound} disabled={selected.size === 0 || bulkBusy} {...tapProps}>
              <Check size={15} strokeWidth={2.5} /> Mark found
            </motion.button>
            <motion.button className="btn btn-sm btn-ghost !text-danger" onClick={bulkDelete} disabled={selected.size === 0 || bulkBusy} {...tapProps}>
              <Trash2 size={15} strokeWidth={2.5} /> Delete
            </motion.button>
          </div>
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

      {qrcodes && qrcodes.length > 0 && visible.length === 0 && filtering && (
        <div className="card text-center flex flex-col items-center gap-3 py-8">
          <span className="w-12 h-12 grid place-items-center rounded-[12px] bg-surface text-muted-2"><Search size={24} strokeWidth={2} /></span>
          <p className="text-muted m-0">No codes match your search or filter.</p>
          <motion.button className="btn btn-sm" onClick={() => { setQuery(''); setStatusFilter('ALL'); }} {...tapProps}>
            Clear filters
          </motion.button>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {visible.map((qr, i) => {
          const item = qr.item;
          const itemStatus = item?.status;
          const isSel = selected.has(qr.qrId);
          const activate = () => (selectMode ? toggleOne(qr.qrId) : navigate(`/qr/${qr.qrId}`));
          return (
            <motion.div
              className={`card flex flex-col cursor-pointer ${selectMode && isSel ? '!border-primary ring-2 ring-primary/40' : ''}`}
              key={qr.qrId}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3 }}
              role={selectMode ? 'checkbox' : 'link'}
              aria-checked={selectMode ? isSel : undefined}
              tabIndex={0}
              onClick={activate}
              onKeyDown={(e) => { if (e.key === 'Enter' || (selectMode && e.key === ' ')) { e.preventDefault(); activate(); } }}
            >
              <div className="flex justify-between items-center mb-2.5 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {selectMode && (
                    <input
                      type="checkbox"
                      className="flex-none"
                      checked={isSel}
                      onChange={() => toggleOne(qr.qrId)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${qr.qrId}`}
                    />
                  )}
                  <span className="font-mono font-semibold text-[.82rem] bg-surface border border-border rounded-xs px-2 py-1 truncate">{qr.qrId}</span>
                </div>
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

              <div className={`flex flex-wrap gap-[.45rem] mt-auto pt-0.5 ${selectMode ? 'hidden' : ''}`} onClick={(e) => e.stopPropagation()}>
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
