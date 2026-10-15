import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { passwordError, passwordStrength } from '../lib/validators.js';
import { notify } from '../lib/toast.jsx';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const strength = passwordStrength(password);

  async function onSubmit(e) {
    e.preventDefault();
    const next = {};
    const pErr = passwordError(password);
    if (pErr) next.password = pErr;
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match';
    if (Object.keys(next).length) return setErrors(next);
    setErrors({});
    setBusy(true);
    try {
      await resetPassword({ token, password, confirmPassword });
      setDone(true);
    } catch (err) {
      // Field-level server errors (e.g. "same as current password") map onto the
      // matching input; everything else (expired/invalid token) is a toast.
      const details = err.data?.details;
      if (Array.isArray(details) && details.length) {
        const next = {};
        for (const d of details) if (d?.path) next[d.path] = d.message;
        setErrors(next);
        if (!next.password && !next.confirmPassword) notify.error(err.message);
      } else {
        notify.error(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="form-card">
        <div className="form-head">
          <h1>Reset password</h1>
        </div>
        <p className="status-msg status-error">This reset link is missing its token. Request a new one.</p>
        <Link to="/forgot-password" className="btn btn-primary btn-lg w-full mt-2">Request a new link</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="form-card">
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <span className="w-12 h-12 grid place-items-center rounded-full bg-success-weak text-success">
            <CheckCircle2 size={26} strokeWidth={2.5} />
          </span>
          <h1 className="!mb-0">Password updated</h1>
          <p className="text-muted">Your password has been changed. You can now log in with it.</p>
          <button className="btn btn-primary btn-lg w-full mt-2" onClick={() => navigate('/login', { replace: true })}>Go to log in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-card">
      <div className="form-head">
        <h1>Set a new password</h1>
        <p>Choose a strong password you’ll remember.</p>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <label className="field-label">New password
          <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }} autoComplete="new-password" invalid={!!errors.password} />
        </label>
        {password && (
          <div className="mt-1.5 mb-1" aria-live="polite">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength.score ? strength.color : 'bg-border'}`} />
              ))}
            </div>
            <span className="text-xs text-muted">{strength.label}</span>
          </div>
        )}
        {errors.password && <p className="text-danger text-xs -mt-1 mb-2">{errors.password}</p>}

        <label className="field-label">Confirm new password
          <PasswordInput value={confirmPassword} onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirmPassword: undefined })); }} autoComplete="new-password" invalid={!!errors.confirmPassword} />
        </label>
        {errors.confirmPassword && <p className="text-danger text-xs -mt-1 mb-2">{errors.confirmPassword}</p>}

        <motion.button className="btn btn-primary btn-lg w-full" disabled={busy} {...tapProps}>
          {busy ? <Spinner size={18} /> : <KeyRound size={18} strokeWidth={2.5} />}
          {busy ? 'Updating…' : 'Update password'}
        </motion.button>
      </form>
      <p className="text-center text-muted mt-4 text-sm"><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
