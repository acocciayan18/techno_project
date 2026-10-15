import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../store/dataStore.js';
import { usePending } from '../../lib/useAsync.js';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { tapProps } from '../../components/motion.jsx';
import Spinner from '../../components/Spinner.jsx';
import { SkeletonTable } from '../../components/Skeleton.jsx';
import UserDetailDrawer from '../../components/UserDetailDrawer.jsx';
import { notify } from '../../lib/toast.jsx';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { run, isPending } = usePending();
  const confirm = useConfirm();
  const [selected, setSelected] = useState(null); // open drawer uid
  const { data: users, error, loading, reload } = useResource('admin/users', () =>
    api.get('/admin/users').then((r) => r.users),
  );

  function toggle(u) {
    const disabling = !u.disabled;
    const doToggle = () =>
      run(u.uid, async () => {
        const action = disabling ? 'disable' : 'enable';
        try {
          await api.put(`/admin/users/${u.uid}/${action}`, {});
          await reload();
          notify.success(`@${u.username} ${disabling ? 'disabled' : 'enabled'}.`);
        } catch (e) {
          notify.error(e.message);
          throw e; // keep the confirm modal open on failure
        }
      });

    // Re-enabling restores access — harmless, so act immediately.
    if (!disabling) return doToggle();

    // Disabling locks the user out and ends their session on the next request.
    return confirm({
      title: `Disable @${u.username}?`,
      description:
        'They’re signed out on their next request and can’t log in until you enable the ' +
        'account again. Their QR codes and items are kept.',
      confirmLabel: 'Disable account',
      busyLabel: 'Disabling…',
      variant: 'warning',
      onConfirm: doToggle,
    });
  }

  if (error && !users) return <p className="status-msg status-error">{error}</p>;
  if (loading && !users) return (
    <div>
      <h1>Users</h1>
      <SkeletonTable cols={5} rows={6} />
    </div>
  );

  return (
    <div>
      <h1>Users</h1>
      <p className="text-muted text-sm -mt-2 mb-4">Select a user to view their account, security details, and recent admin changes, or to edit their information.</p>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.uid}
                className={`cursor-pointer ${selected === u.uid ? 'bg-surface' : ''}`}
                onClick={() => setSelected(u.uid)}
                tabIndex={0}
                role="button"
                aria-label={`View @${u.username}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(u.uid); } }}
              >
                <td>{u.name || '—'}</td>
                <td className="font-mono">@{u.username}</td>
                <td><span className={`badge ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{u.role}</span></td>
                <td><span className={`badge ${u.disabled ? 'badge-red' : 'badge-green'}`}>{u.disabled ? 'Disabled' : 'Active'}</span></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {u.uid === me?.uid ? (
                      <span className="text-muted text-xs">You</span>
                    ) : (
                      <motion.button className="btn btn-sm" onClick={() => toggle(u)} disabled={isPending(u.uid)} {...tapProps}>
                        {isPending(u.uid) && <Spinner size={14} />}
                        {u.disabled ? 'Enable' : 'Disable'}
                      </motion.button>
                    )}
                    <motion.button className="btn btn-sm btn-ghost !px-2" onClick={() => setSelected(u.uid)} aria-label={`Open @${u.username}`} {...tapProps}>
                      <ChevronRight size={16} strokeWidth={2.5} />
                    </motion.button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserDetailDrawer uid={selected} meUid={me?.uid} onClose={() => setSelected(null)} onChanged={reload} />
    </div>
  );
}
