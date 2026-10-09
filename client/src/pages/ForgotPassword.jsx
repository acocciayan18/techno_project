import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, User, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import { notify } from '../lib/toast.jsx';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await forgotPassword(username.trim().toLowerCase());
      // The server responds the same way whether or not the account exists, so
      // we show a neutral confirmation either way (no account enumeration).
      setDone(true);
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
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
            If an account with a recovery email exists for that username, we’ve sent a reset link.
            It’s valid for 1 hour.
          </p>
          <Link to="/login" className="btn btn-primary btn-lg w-full mt-2">Back to log in</Link>
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
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoComplete="username" placeholder="Username" autoCapitalize="none" spellCheck="false" required />
          </div>
        </label>
        <motion.button className="btn btn-primary btn-lg w-full" disabled={busy} {...tapProps}>
          {busy ? <Spinner size={18} /> : <Send size={18} strokeWidth={2.5} />}
          {busy ? 'Sending…' : 'Send reset link'}
        </motion.button>
      </form>
      <p className="text-center text-muted mt-4 text-sm"><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
