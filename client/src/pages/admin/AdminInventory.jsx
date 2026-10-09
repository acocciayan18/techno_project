import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, X, ChevronRight, Printer, KeyRound, Copy, Download, AlertTriangle, Check } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useResource } from '../../store/dataStore.js';
import { usePending } from '../../lib/useAsync.js';
import { tapProps } from '../../components/motion.jsx';
import Spinner from '../../components/Spinner.jsx';
import { SkeletonTable } from '../../components/Skeleton.jsx';
import QrDetailDrawer from '../../components/QrDetailDrawer.jsx';
import QrPrintDialog from '../../components/QrPrintDialog.jsx';
import { notify } from '../../lib/toast.jsx';

const BADGE = { AVAILABLE: 'badge-green', PENDING: 'badge-amber', ACTIVATED: 'badge-blue', DISABLED: 'badge-gray' };
const STATUS_ORDER = { PENDING: 0, AVAILABLE: 1, ACTIVATED: 2, DISABLED: 3 };

const SORTS = {
  'id-asc': { label: 'QR ID ↑', cmp: (a, b) => (a.qrId < b.qrId ? -1 : 1) },
  'id-desc': { label: 'QR ID ↓', cmp: (a, b) => (a.qrId > b.qrId ? -1 : 1) },
  status: { label: 'Status', cmp: (a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.qrId < b.qrId ? -1 : 1) },
  owner: { label: 'Owner', cmp: (a, b) => (a.ownerUsername || '~').localeCompare(b.ownerUsername || '~') || (a.qrId < b.qrId ? -1 : 1) },
};

export default function AdminInventory() {
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('id-asc');
  const [count, setCount] = useState(5);
  const [newSecrets, setNewSecrets] = useState(null); // [{qrId, secret}] shown once after generation
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState(null); // open drawer qrId
  const [picked, setPicked] = useState(() => new Set()); // qrIds checked for printing
  const [printOpen, setPrintOpen] = useState(false);
  const { run, isPending } = usePending();

  // Cache per filter so flipping back to a filter shows its rows instantly.
  const { data: rows, error: loadError, loading, reload } = useResource(
    `admin/qrcodes/${filter || 'all'}`,
    () => api.get(`/admin/qrcodes${filter ? `?status=${filter}` : ''}`).then((r) => r.qrcodes),
  );

  // Search (QR id / owner / item name) + sort are applied client-side over the
  // status-filtered rows the server returned.
  const displayed = useMemo(() => {
    if (!rows) return rows;
    const q = search.trim().toLowerCase();
    const matched = q
      ? rows.filter((r) =>
          r.qrId.toLowerCase().includes(q) ||
          (r.ownerUsername || '').toLowerCase().includes(q) ||
          (r.item?.name || '').toLowerCase().includes(q))
      : rows;
    return [...matched].sort(SORTS[sort].cmp);
  }, [rows, search, sort]);

  // Selection for bulk printing. Ids persist across filter/search changes so a
  // batch can be assembled from several views; "select all" acts on what's shown.
  const pickedIds = useMemo(() => [...picked], [picked]);
  const shownIds = displayed ? displayed.map((r) => r.qrId) : [];
  const allShownPicked = shownIds.length > 0 && shownIds.every((id) => picked.has(id));

  function togglePick(qrId) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(qrId) ? next.delete(qrId) : next.add(qrId);
      return next;
    });
  }
  function toggleAllShown() {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) shownIds.forEach((id) => next.delete(id));
      else shownIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function generate() {
    return run('generate', async () => {
      setCopied(false);
      try {
        const { created, secrets } = await api.post('/admin/qr/generate', { count: Number(count) });
        setNewSecrets(secrets); // one-time — these can never be retrieved again
        await reload();
        notify.success(`Generated ${created.length} QR code${created.length === 1 ? '' : 's'} (${created[0]} … ${created[created.length - 1]}).`);
      } catch (e) {
        notify.error(e.message);
      }
    });
  }

  const secretsCsv = () =>
    'qr_id,activation_code\n' + (newSecrets || []).map((s) => `${s.qrId},${s.secret}`).join('\n');

  async function copySecrets() {
    try {
      await navigator.clipboard.writeText(secretsCsv());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error('Could not copy to clipboard — use Download instead.');
    }
  }

  function downloadSecrets() {
    const blob = new Blob([secretsCsv()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-activation-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1>QR Inventory</h1>

      <div className="card flex gap-4 items-end flex-wrap">
        <label className="field-label !mb-0">Pre-generate
          <input type="number" min="1" max="500" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <motion.button className="btn btn-primary" onClick={generate} disabled={isPending('generate')} {...tapProps}>
          {isPending('generate') ? <Spinner size={18} /> : <Plus size={18} strokeWidth={2.5} />}
          {isPending('generate') ? 'Generating…' : 'Generate QR codes'}
        </motion.button>
      </div>
      {loadError && <p className="status-msg status-error">{loadError}</p>}

      {/* One-time reveal of the new activation codes. They are stored hashed and
          can never be shown again — the admin must save them now and pair each
          with its product. */}
      {newSecrets && newSecrets.length > 0 && (
        <div className="card !mb-4 !border-warn">
          <div className="flex items-start gap-2.5 mb-3">
            <span className="flex-none w-9 h-9 grid place-items-center rounded-[10px] bg-warn-weak text-warn"><KeyRound size={18} strokeWidth={2.2} /></span>
            <div className="min-w-0">
              <h3 className="m-0 flex items-center gap-2 text-base">Activation codes — shown once</h3>
              <p className="text-sm text-muted m-0 mt-0.5 flex items-start gap-1.5">
                Save these now. They’re stored hashed and cannot be retrieved again. Print each code with its product (not in the QR itself).
              </p>
            </div>
            <button type="button" className="ml-auto text-muted-2 hover:text-ink cursor-pointer" onClick={() => setNewSecrets(null)} aria-label="Dismiss codes">
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap mb-3">
            <motion.button className="btn btn-sm" onClick={copySecrets} {...tapProps}>
              {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} strokeWidth={2.5} />} {copied ? 'Copied' : 'Copy all'}
            </motion.button>
            <motion.button className="btn btn-sm" onClick={downloadSecrets} {...tapProps}>
              <Download size={15} strokeWidth={2.5} /> Download CSV
            </motion.button>
          </div>
          <div className="overflow-x-auto max-h-[240px] overflow-y-auto border border-border rounded-xs">
            <table className="data-table">
              <thead><tr><th>QR ID</th><th>Activation code</th></tr></thead>
              <tbody>
                {newSecrets.map((s) => (
                  <tr key={s.qrId}>
                    <td className="font-mono">{s.qrId}</td>
                    <td className="font-mono select-all">{s.secret}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toolbar: search + sort */}
      <div className="flex gap-3 flex-wrap items-center my-4">
        <label className="inp-icon flex-1 min-w-[200px]">
          <Search />
          <input
            type="text"
            placeholder="Search QR ID, owner, or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search inventory"
          />
          {search && (
            <button
              type="button"
              className="inp-trail"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          )}
        </label>
        <label className="field-label !mb-0 flex items-center gap-2">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="!mt-0 !w-auto min-w-[130px]">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      {/* Status / availability filters */}
      <div className="flex gap-[.55rem] flex-wrap mb-4">
        {['', 'AVAILABLE', 'PENDING', 'ACTIVATED', 'DISABLED'].map((f) => (
          <motion.button
            key={f || 'all'}
            className={`chip-toggle ${filter === f ? 'chip-toggle-active' : ''}`}
            onClick={() => setFilter(f)}
            whileTap={{ scale: 0.95 }}
          >
            {f || 'All'}
          </motion.button>
        ))}
      </div>

      {/* Bulk-print action bar — appears once any QR is picked. */}
      {picked.size > 0 && (
        <div className="card !mb-4 flex items-center gap-3 flex-wrap !py-3">
          <span className="font-semibold text-sm">{picked.size} selected for printing</span>
          <div className="flex gap-2 ml-auto">
            <motion.button className="btn btn-sm" onClick={() => setPicked(new Set())} {...tapProps}>Clear</motion.button>
            <motion.button className="btn btn-sm btn-primary" onClick={() => setPrintOpen(true)} {...tapProps}>
              <Printer size={15} strokeWidth={2.5} /> Print selected
            </motion.button>
          </div>
        </div>
      )}

      {loading && !rows ? <SkeletonTable cols={7} rows={6} /> : !rows ? null : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[1%]">
                  <input
                    type="checkbox"
                    checked={allShownPicked}
                    onChange={toggleAllShown}
                    aria-label="Select all shown"
                  />
                </th>
                <th>QR ID</th><th>Status</th><th>Owner</th><th>Item</th><th>Item status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => (
                <tr
                  key={r.qrId}
                  className={`cursor-pointer ${selected === r.qrId ? 'bg-surface' : ''}`}
                  onClick={() => setSelected(r.qrId)}
                  tabIndex={0}
                  role="button"
                  aria-label={`View ${r.qrId}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r.qrId); } }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={picked.has(r.qrId)}
                      onChange={() => togglePick(r.qrId)}
                      aria-label={`Select ${r.qrId} for printing`}
                    />
                  </td>
                  <td className="font-mono">{r.qrId}</td>
                  <td><span className={`badge ${BADGE[r.status] || 'badge-gray'}`}>{r.status}</span></td>
                  <td>
                    <span className="block max-w-[12rem] truncate">
                      {r.ownerUsername
                        ? `@${r.ownerUsername}`
                        : r.status === 'PENDING' && r.claimantUsername
                          ? <span className="text-warn">@{r.claimantUsername} <span className="text-muted-2">(requested)</span></span>
                          : '—'}
                    </span>
                  </td>
                  <td><span className="block max-w-[14rem] truncate" title={r.item?.name || undefined}>{r.item?.name || '—'}</span></td>
                  <td>{r.item?.status || '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end">
                      <motion.button className="btn btn-sm btn-ghost !px-2" onClick={() => setSelected(r.qrId)} aria-label={`Open ${r.qrId}`} {...tapProps}>
                        <ChevronRight size={16} strokeWidth={2.5} />
                      </motion.button>
                    </div>
                  </td>
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-muted text-center">
                    {rows.length === 0
                      ? 'No QR codes yet. Generate a batch above to start.'
                      : search
                        ? `No matches for “${search}”.`
                        : 'No QR codes for this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <QrDetailDrawer qrId={selected} onClose={() => setSelected(null)} onChanged={reload} />
      {printOpen && <QrPrintDialog qrIds={pickedIds} onClose={() => setPrintOpen(false)} />}
    </div>
  );
}
