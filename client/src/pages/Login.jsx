import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { notify } from '../lib/toast.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
      // Everyone lands on the same dashboard; admin features appear there by role.
      const dest = location.state?.from?.pathname || '/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card">
      <div className="form-head">
        <h1>Welcome back</h1>
        <p>Log in to manage your tags.</p>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <label className="field-label">Username
          <div className="inp-icon mt-1.5">
            <User />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </div>
        </label>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="login-password" className="field-label !mb-0">Password</label>
          <Link to="/forgot-password" className="text-xs font-semibold">Forgot?</Link>
        </div>
        <div className="mb-4">
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <motion.button className="btn btn-primary btn-lg w-full" disabled={busy} {...tapProps}>
          {busy && <Spinner size={18} />}
          {busy ? 'Logging in…' : 'Log in'}
        </motion.button>
      </form>
      <p className="text-center text-muted mt-5 text-sm">No account? <Link to="/register">Create one</Link></p>
    </div>
  );
}
