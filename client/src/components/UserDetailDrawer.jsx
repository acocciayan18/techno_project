import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, Check, Ban, Power, ShieldCheck, Clock, User, AtSign, Mail, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { useResource } from '../store/dataStore.js';
import { usePending } from '../lib/useAsync.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { tapProps } from './motion.jsx';
import Spinner from './Spinner.jsx';
import { Skeleton } from './Skeleton.jsx';
import PasswordInput from './PasswordInput.jsx';
import { usernameError, passwordError } from '../lib/validators.js';
import { LIMITS } from '../lib/limits.js';
import { notify } from '../lib/toast.jsx';

function fmtDate(iso) {
  if (!iso) return '—';
  // Handle both ISO strings (memory DB) and Firestore Timestamp shapes (cloud).
  const value =
    iso && typeof iso === 'object'
      ? (iso._seconds ?? iso.seconds) != null
        ? (iso._seconds ?? iso.seconds) * 1000
        : iso
      : iso;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

// Human-readable label for an audit action, plus the icon/accent it reads with.
function describeAction(log) {
  const fields = Array.isArray(log.details?.fields) ? log.details.fields : [];
  const labelOf = { name: 'name', username: 'username', recoveryEmail: 'recovery email', password: 'password' };
  const pretty = fields.map((f) => labelOf[f] || f);
  switch (log.action) {
    case 'user.update':
      return { text: pretty.length ? `Edited ${pretty.join(', ')}` : 'Edited account', Icon: Pencil, tone: 'text-primary' };
    case 'user.disable':
      return { text: 'Disabled account', Icon: Ban, tone: 'text-danger' };
    case 'user.enable':
      return { text: 'Enabled account', Icon: Check, tone: 'text-success' };
    default:
      return { text: log.action, Icon: Clock, tone: 'text-muted' };
  }
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border last:border-none">
      <span className="text-muted text-sm flex-none">{label}</span>
      <span className="text-ink text-sm text-right break-words min-w-0">{children}</span>
    </div>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="text-danger text-xs mt-1 mb-0">{msg}</p>;
}

// Edit form for one account. Starts from the loaded user; only actually-changed
// fields are sent. Password is optional (leave blank to keep the current one).
function EditForm({ user, onCancel, onSaved }) {
  const { run, isPending } = usePending();
  const [form, setForm] = useState({
    name: user.name || '',
    username: user.username || '',
    recoveryEmail: user.recoveryEmail || '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = 'Full name is required';
    const uErr = usernameError(form.username);
    if (uErr) next.username = uErr;
    if (form.recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recoveryEmail))
      next.recoveryEmail = 'Enter a valid email';
    if (form.password) {
      const pErr = passwordError(form.password);
      if (pErr) next.password = pErr;
      if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match';
    }
    return next;
  }

  // Build a patch of only the fields that actually changed from the loaded user.
  function buildPatch() {
    const patch = {};
    const name = form.name.trim();
    const username = form.username.trim().toLowerCase();
    const email = form.recoveryEmail.trim().toLowerCase();
    if (name !== (user.name || '')) patch.name = name;
    if (username !== (user.username || '')) patch.username = username;
    if (email !== (user.recoveryEmail || '')) patch.recoveryEmail = email;
    if (form.password) patch.password = form.password;
    return patch;
  }

  function submit(e) {
    e.preventDefault();
    const localErrors = validate();
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      notify.info('No changes to save.');
      return;
    }
    return run('save', async () => {
      try {
        const { user: updated } = await api.put(`/admin/users/${user.uid}`, patch);
        notify.success(`@${updated.username} updated.`);
        onSaved?.();
      } catch (err) {
        // Map server field errors (zod details) back onto the inputs; conflicts
        // (duplicate username / email) and other faults surface as a toast.
        const details = err.data?.details;
        if (Array.isArray(details) && details.length) {
          const mapped = {};
          for (const d of details) mapped[d.path] = d.message;
          setErrors(mapped);
        } else {
          notify.error(err.message);
        }
      }
    });
  }

  const busy = isPending('save');

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <label className="field-label">Full name
        <div className="inp-icon mt-1.5">
          <User />
          <input value={form.name} onChange={set('name')} maxLength={LIMITS.name} autoComplete="off" aria-invalid={errors.name ? true : undefined} />
        </div>
      </label>
      <FieldError msg={errors.name} />

      <label className="field-label">Username
        <div className="inp-icon mt-1.5">
          <AtSign />
          <input
            value={form.username}
            onChange={set('username')}
            maxLength={LIMITS.username}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
            aria-invalid={errors.username ? true : undefined}
          />
        </div>
      </label>
      <FieldError msg={errors.username} />

      <label className="field-label">Recovery email <span className="text-muted font-normal">(optional)</span>
        <div className="inp-icon mt-1.5">
          <Mail />
          <input type="email" value={form.recoveryEmail} onChange={set('recoveryEmail')} maxLength={LIMITS.recoveryEmail} autoComplete="off" placeholder="email@example.com" aria-invalid={errors.recoveryEmail ? true : undefined} />
        </div>
      </label>
      <FieldError msg={errors.recoveryEmail} />

      <label className="field-label">New password <span className="text-muted font-normal">(leave blank to keep current)</span>
        <PasswordInput value={form.password} onChange={set('password')} placeholder="********" autoComplete="new-password" invalid={!!errors.password} />
      </label>
      <FieldError msg={errors.password} />

      {form.password && (
        <>
          <label className="field-label">Confirm new password
            <PasswordInput value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="********" autoComplete="new-password" invalid={!!errors.confirmPassword} />
          </label>
          <FieldError msg={errors.confirmPassword} />
        </>
      )}

      <div className="flex gap-2 justify-end mt-2">
        <motion.button type="button" className="btn btn-sm" onClick={onCancel} disabled={busy} {...tapProps}>Cancel</motion.button>
        <motion.button type="submit" className="btn btn-sm btn-primary" disabled={busy} {...tapProps}>
          {busy ? <Spinner size={14} /> : <Check size={15} strokeWidth={2.5} />}
          {busy ? 'Saving…' : 'Save changes'}
        </motion.button>
      </div>
    </form>
  );
}

// Inner body: only mounted while a user is selected, so its fetch never fires
// for a closed drawer. `meUid` is the signed-in admin, used to block the
// disable-your-own-account action (the server enforces it too).
function DrawerBody({ uid, meUid, onChanged }) {
  const { data, error, loading, reload } = useResource(
    `admin/users/${uid}`,
    () => api.get(`/admin/users/${uid}`),
  );
  const { run, isPending } = usePending();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

  const user = data?.user;
  const logs = data?.logs || [];
  const isSelf = user && user.uid === meUid;

  async function afterChange() {
    await reload();
    onChanged?.();
  }

  function toggleDisabled() {
    const disabling = !user.disabled;
    const doToggle = () =>
      run('toggle', async () => {
        const action = disabling ? 'disable' : 'enable';
        try {
          await api.put(`/admin/users/${uid}/${action}`, {});
          await afterChange();
          notify.success(`@${user.username} ${disabling ? 'disabled' : 'enabled'}.`);
        } catch (e) {
          notify.error(e.message);
          throw e; // keep the confirm modal open on failure
        }
      });

    // Re-enabling restores access — harmless, so act immediately.
    if (!disabling) return doToggle();

    // Disabling locks the user out and ends their session on the next request.
    return confirm({
      title: `Disable @${user.username}?`,
      description:
        'They’re signed out on their next request and can’t log in until you enable the ' +
        'account again. Their QR codes and items are kept.',
      confirmLabel: 'Disable account',
      busyLabel: 'Disabling…',
      variant: 'warning',
      icon: Power,
      onConfirm: doToggle,
    });
  }

  if (error && !data) return <p className="status-msg status-error">{error}</p>;
  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-10 w-full mt-2" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Account */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm uppercase tracking-wide text-muted m-0">Account</h3>
          {!editing && (
            <motion.button className="btn btn-sm btn-ghost !px-2" onClick={() => setEditing(true)} {...tapProps}>
              <Pencil size={15} strokeWidth={2.5} /> Edit
            </motion.button>
          )}
        </div>

        {editing ? (
          <div className="card !mb-0">
            <EditForm user={user} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await afterChange(); }} />
          </div>
        ) : (
          <>
            <div className="card !mb-0 !py-1">
              <Row label="Name">{user.name || '—'}</Row>
              <Row label="Username"><span className="font-mono">@{user.username}</span></Row>
              <Row label="Role">
                <span className={`badge ${user.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{user.role}</span>
              </Row>
              <Row label="Status">
                <span className={`badge ${user.disabled ? 'badge-red' : 'badge-green'}`}>{user.disabled ? 'Disabled' : 'Active'}</span>
              </Row>
              <Row label="Recovery email">{user.recoveryEmail ? <span className="break-all">{user.recoveryEmail}</span> : '—'}</Row>
              <Row label="Created">{fmtDate(user.createdAt)}</Row>
            </div>

            {isSelf ? (
              <p className="text-muted text-xs mt-3 m-0">This is your own account — you can’t disable it.</p>
            ) : (
              <div className="flex gap-2 flex-wrap mt-3">
                <motion.button
                  className={`btn btn-sm ${user.disabled ? 'btn-success' : 'btn-danger'}`}
                  onClick={toggleDisabled}
                  disabled={isPending('toggle')}
                  {...tapProps}
                >
                  {isPending('toggle') ? <Spinner size={14} /> : user.disabled ? <Check size={15} strokeWidth={2.5} /> : <Ban size={15} strokeWidth={2.5} />}
                  {user.disabled ? 'Enable account' : 'Disable account'}
                </motion.button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Security */}
      <div>
        <h3 className="text-sm uppercase tracking-wide text-muted mb-1 flex items-center gap-1.5">
          <ShieldCheck size={15} strokeWidth={2.5} /> Security
        </h3>
        <div className="card !mb-0 !py-1">
          <Row label="Failed logins">{user.failedAttempts || 0}</Row>
          <Row label="Locked until">
            {user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()
              ? <span className="text-danger">{fmtDate(user.lockedUntil)}</span>
              : 'Not locked'}
          </Row>
          <Row label="Terms accepted">
            {user.termsAcceptedAt ? `${fmtDate(user.termsAcceptedAt)}${user.termsVersion ? ` (v${user.termsVersion})` : ''}` : '—'}
          </Row>
        </div>
      </div>

      {/* Admin activity log */}
      <div>
        <h3 className="text-sm uppercase tracking-wide text-muted mb-1 flex items-center gap-1.5">
          <Clock size={15} strokeWidth={2.5} /> Recent admin changes
        </h3>
        <div className="card !mb-0 !py-1">
          {logs.length === 0 ? (
            <p className="text-muted text-sm py-2 m-0">No admin actions recorded for this account yet.</p>
          ) : (
            <ul className="m-0 p-0 list-none">
              {logs.map((log) => {
                const { text, Icon, tone } = describeAction(log);
                return (
                  <li key={log.id} className="flex items-start gap-2.5 py-2 border-b border-border last:border-none">
                    <span className={`flex-none mt-0.5 ${tone}`}><Icon size={16} strokeWidth={2.4} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink m-0">{text}</p>
                      <p className="text-xs text-muted m-0 mt-0.5">
                        {log.actorUsername ? <span className="font-mono">@{log.actorUsername}</span> : 'system'} · {fmtDate(log.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Slide-over shell. `uid` null = closed; the fetching body only mounts while open.
export default function UserDetailDrawer({ uid, meUid, onClose, onChanged }) {
  useEffect(() => {
    if (!uid) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [uid, onClose]);

  return createPortal(
    <AnimatePresence>
      {uid && (
        <>
          <motion.div
            key="user-drawer-backdrop"
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            key="user-drawer-panel"
            className="fixed right-0 top-0 bottom-0 z-[71] w-full max-w-[480px] bg-bg border-l border-border shadow-brutal-sm overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="User details"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-4 bg-bg/90 backdrop-blur-lg border-b border-border">
              <h2 className="text-lg font-bold m-0 flex items-center gap-2"><KeyRound size={18} strokeWidth={2.4} /> User account</h2>
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
              <DrawerBody uid={uid} meUid={meUid} onChanged={onChanged} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
