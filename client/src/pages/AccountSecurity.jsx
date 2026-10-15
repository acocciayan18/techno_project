import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone, Trash2, Mail } from 'lucide-react';
import { api } from '../lib/api.js';
import { notify } from '../lib/toast.jsx';
import { useAuthStore } from '../store/authStore.js';
import PasswordInput from '../components/PasswordInput.jsx';
import Spinner from '../components/Spinner.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';

function date(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
}

export default function AccountSecurity() {
  const user = useAuthStore((s) => s.user);
  const confirm = useConfirm();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState({ currentPassword: '', password: '', confirmPassword: '' });
  const [email, setEmail] = useState(user?.recoveryEmail || '');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentEmail, setCurrentEmail] = useState(user?.recoveryEmail || '');
  const [emailVerified, setEmailVerified] = useState(!!user?.recoveryEmailVerified);
  const [busy, setBusy] = useState('');

  async function loadSessions() {
    try { setSessions((await api.get('/auth/sessions')).sessions || []); }
    catch (e) { notify.error(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadSessions(); }, []);

  async function changePassword(e) {
    e.preventDefault();
    setBusy('password');
    try {
      await api.put('/auth/me/password', password);
      setPassword({ currentPassword: '', password: '', confirmPassword: '' });
      notify.success('Password changed. Other sessions were signed out.');
      await loadSessions();
    } catch (e) { notify.error(e.message); }
    finally { setBusy(''); }
  }

  async function changeEmail(e) {
    e.preventDefault();
    setBusy('email');
    try {
      const result = await api.post('/auth/me/recovery-email', { recoveryEmail: email, currentPassword: emailPassword });
      setCurrentEmail(result.user?.recoveryEmail || email);
      setEmailVerified(false);
      setEmailPassword('');
      notify.success('Verification email sent. Your new address stays unverified until confirmed.');
    } catch (e) { notify.error(e.message); }
    finally { setBusy(''); }
  }

  async function revoke(id) {
    try { await api.del(`/auth/sessions/${id}`); await loadSessions(); notify.success('Session revoked.'); }
    catch (e) { notify.error(e.message); }
  }

  function revokeOthers() {
    confirm({
      title: 'Sign out other sessions?',
      description: 'Every other device will need to sign in again.',
      confirmLabel: 'Sign out others',
      onConfirm: async () => { await api.post('/auth/sessions/revoke-others', {}); await loadSessions(); notify.success('Other sessions revoked.'); },
    });
  }

  return (
    <div className="w-full max-w-2xl">
      <h1>Account security</h1>
      <p className="text-muted mt-1">Manage your password, recovery email, and signed-in devices.</p>
      <section className="card mt-5">
        <h2 className="text-lg flex items-center gap-2"><KeyRound size={19} /> Change password</h2>
        <form onSubmit={changePassword} className="flex flex-col gap-3 mt-4">
          <label className="field-label">Current password<PasswordInput value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} /></label>
          <label className="field-label">New password<PasswordInput value={password.password} onChange={(e) => setPassword({ ...password, password: e.target.value })} autoComplete="new-password" /></label>
          <label className="field-label">Confirm new password<PasswordInput value={password.confirmPassword} onChange={(e) => setPassword({ ...password, confirmPassword: e.target.value })} autoComplete="new-password" /></label>
          <button className="btn btn-primary self-start" disabled={busy === 'password'}>{busy === 'password' ? <Spinner size={14} /> : <ShieldCheck size={15} />} Change password</button>
        </form>
      </section>
      <section className="card mt-5">
        <h2 className="text-lg flex items-center gap-2"><Mail size={19} /> Recovery email</h2>
        <p className="text-sm text-muted">Current address: {currentEmail || 'Not set'} {currentEmail && (emailVerified ? '(verified)' : '(unverified)')}</p>
        <form onSubmit={changeEmail} className="flex gap-2 mt-3">
          <input className="flex-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
          <PasswordInput value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="Current password" />
          <button className="btn btn-primary" disabled={busy === 'email'}>{busy === 'email' ? <Spinner size={14} /> : 'Verify email'}</button>
        </form>
      </section>
      <section className="card mt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg flex items-center gap-2"><Smartphone size={19} /> Active sessions</h2>
          <button className="btn btn-sm" onClick={revokeOthers}>Sign out others</button>
        </div>
        {loading ? <p className="text-muted mt-3">Loading sessions…</p> : sessions.length === 0 ? <p className="text-muted mt-3">No active sessions found.</p> : (
          <ul className="list-none p-0 m-0 mt-3">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-none">
                <div><strong className="block text-sm">{session.current ? 'This device' : 'Signed-in device'}</strong><span className="text-xs text-muted">{session.userAgent || 'Unknown browser'} · Last active {date(session.lastSeenAt)}</span></div>
                {!session.current && <button className="btn btn-sm btn-ghost text-danger" onClick={() => revoke(session.id)} aria-label="Revoke session"><Trash2 size={15} /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
