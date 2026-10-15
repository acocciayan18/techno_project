import { api } from '../../lib/api.js';
import { useResource } from '../../store/dataStore.js';
import { SkeletonTable } from '../../components/Skeleton.jsx';

const BADGE = { ACTIVE: 'badge-green', LOST: 'badge-red', RECOVERED: 'badge-blue' };

export default function AdminItems() {
  const { data: items, error, loading } = useResource('admin/items', () => api.get('/admin/items').then((r) => r.items));

  if (error && !items) return <p className="status-msg status-error">{error}</p>;
  if (loading && !items) return (
    <div>
      <h1>Registered Items</h1>
      <SkeletonTable cols={3} rows={6} />
    </div>
  );

  return (
    <div>
      <h1>Registered Items</h1>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>QR ID</th><th>Item</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.qrId}>
                <td className="font-mono">{it.qrId}</td>
                <td><span className="block max-w-[16rem] truncate" title={it.name || undefined}>{it.name || '—'}</span></td>
                <td><span className={`badge ${BADGE[it.status] || 'badge-gray'}`}>{it.status}</span></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="3" className="text-muted text-center">No items registered.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
