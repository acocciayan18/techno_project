import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, CheckCircle2, RotateCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import { usernameError } from '../lib/validators.js';
import { notify } from '../lib/toast.jsx';

// Matches the server's per-account resend cooldown (AUTH.RESET_REQUEST_COOLDOWN_MS)
// so the "Resend" button can't fire faster than a new email can actually be sent.
const RESEND_COOLDOWN_S = 60;

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef(null);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) { clearInterval(timer.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function send(name) {
    setBusy(true);
    try {
      await forgotPassword(name);
      // The server responds the same way whether or not the account exists, so
      // we show a neutral confirmation either way (no account enumeration).
      setDone(true);
      startCooldown();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const name = username.trim().toLowerCase();
    const msg = usernameError(name);
    if (msg) { setError(msg); return; }
    setError('');
    send(name);
  }

  if (done) {
    return (
      <div className="form-card">
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <span className="w-12 h-12 grid place-items-center rounded-full bg-success-weak text-success">
            <CheckCircle2 size={26} strokeWidth={2.5} />
          </span>
          <h1 className="!mb-0">Check your email</h1>
          <p className="text-muted">
            If an account with a recovery email exists for <span className="font-semibold text-ink">{username.trim().toLowerCase()}</span>,
            we’ve sent a reset link. It’s valid for 1 hour and can be used once.
          </p>
          <p className="text-muted text-sm">
            Don’t see it? Check your spam folder, or resend below.
          </p>
          <motion.button
            type="button"
            className="btn w-full"
            disabled={busy || cooldown > 0}
            onClick={() => send(username.trim().toLowerCase())}
            {...tapProps}
          >
            {busy ? <Spinner size={18} /> : <RotateCw size={18} strokeWidth={2.5} />}
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
          </motion.button>
          <Link to="/login" className="btn btn-primary btn-lg w-full mt-1">Back to log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="form-card">
      <div className="form-head">
        <h1>Forgot password</h1>
        <p>Enter your username and we’ll email a reset link to the recovery email on file.</p>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <label className="field-label">Username
          <div className="inp-icon mt-1.5">
            <User />
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (error) setError(''); }}
              maxLength={20}
              autoComplete="username"
              placeholder="Username"
              autoCapitalize="none"
              spellCheck="false"
              aria-invalid={!!error}
              required
            />
          </div>
        </label>
        {error && <p className="text-danger text-xs mt-1 mb-2">{error}</p>}
        <motion.button className="btn btn-primary btn-lg w-full mt-2" disabled={busy} {...tapProps}>
          {busy && <Spinner size={18} />}
          {busy ? 'Sending…' : 'Send reset link'}
        </motion.button>
      </form>
      <p className="text-center text-muted mt-5 text-sm"><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
