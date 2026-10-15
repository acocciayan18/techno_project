import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, AtSign, Mail, Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { usernameError, passwordError, passwordStrength } from '../lib/validators.js';
import { LIMITS } from '../lib/limits.js';
import { notify } from '../lib/toast.jsx';

const EMPTY = { name: '', username: '', password: '', confirmPassword: '', recoveryEmail: '', acceptedTerms: false };

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({}); // per-field messages
  const [busy, setBusy] = useState(false);
  // Anti-abuse signals sent to the server (see server services/signupGuard.js):
  //  - mountedAt → how long the form was on screen; a scripted insta-submit is flagged.
  //  - honeypot  → a hidden field no human sees; any value marks an automated fill.
  const mountedAt = useRef(Date.now());
  const [honeypot, setHoneypot] = useState('');

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const strength = passwordStrength(form.password);

  // Validate the whole form locally; returns a field->message map.
  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = 'Full name is required';
    const uErr = usernameError(form.username);
    if (uErr) next.username = uErr;
    const pErr = passwordError(form.password);
    if (pErr) next.password = pErr;
    if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match';
    if (form.recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recoveryEmail))
      next.recoveryEmail = 'Enter a valid email';
    if (!form.acceptedTerms) next.acceptedTerms = 'Please agree to the Terms and Privacy Policy to continue';
    return next;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const localErrors = validate();
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        recoveryEmail: form.recoveryEmail.trim(),
        acceptedTerms: form.acceptedTerms,
        elapsedMs: Date.now() - mountedAt.current,
        website: honeypot, // honeypot: real users never touch this
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // Map server-side field errors (zod details) back onto the fields; anything
      // else (duplicate username, server fault) surfaces as a toast.
      const details = err.data?.details;
      if (Array.isArray(details) && details.length) {
        const mapped = {};
        for (const d of details) mapped[d.path] = d.message;
        setErrors(mapped);
      } else {
        notify.error(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-4">
        <Home size={16} strokeWidth={2} /> Home
      </Link>
      <div className="form-head">
        <h1>Create account</h1>
        <p>Set up your account to start tagging items.</p>
      </div>
      <form onSubmit={onSubmit} noValidate>
        {/* Honeypot: off-screen + hidden from AT and tab order. Humans never see or
            reach it; automated form-fillers do, and the server flags any value. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <label className="field-label">Full name
          <div className="inp-icon mt-1.5"><User /><input value={form.name} onChange={set('name')} maxLength={LIMITS.name} autoComplete="name" placeholder='Juan Dela Cruz' aria-invalid={errors.name ? true : undefined} /></div>
        </label>
        <FieldError msg={errors.name} />

        <label className="field-label">Username
          <div className="inp-icon mt-1.5">
            <AtSign />
            <input
              value={form.username}
              onChange={set('username')}
              maxLength={LIMITS.username}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              placeholder="3–20 chars: letters, numbers, _"
              aria-invalid={errors.username ? true : undefined}
            />
          </div>
        </label>
        <FieldError msg={errors.username} />

        <label className="field-label">Password
          <PasswordInput value={form.password} onChange={set('password')} placeholder="********"  autoComplete="new-password" invalid={!!errors.password} />
        </label>
        {form.password && (
          <div className="mt-1.5 mb-1" aria-live="polite">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength.score ? strength.color : 'bg-border'}`} />
              ))}
            </div>
            <span className="text-xs text-muted">{strength.label}</span>
          </div>
        )}
        <FieldError msg={errors.password} />

        <label className="field-label">Confirm password
          <PasswordInput value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="********" autoComplete="new-password" invalid={!!errors.confirmPassword} />
        </label>
        <FieldError msg={errors.confirmPassword} />

        <label className="field-label">Recovery email <span className="text-muted font-normal">(optional)</span>
          <div className="inp-icon mt-1.5"><Mail /><input type="email" value={form.recoveryEmail} onChange={set('recoveryEmail')} maxLength={LIMITS.recoveryEmail} autoComplete="email" placeholder="email@example.com" aria-invalid={errors.recoveryEmail ? true : undefined} /></div>
        </label>
        <FieldError msg={errors.recoveryEmail} />
        <p className="text-xs text-muted -mt-1 mb-4">Add one so you can recover your account.</p>

        <label className="flex items-start gap-2.5 mt-1 mb-4 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 flex-none accent-primary cursor-pointer"
            checked={form.acceptedTerms}
            onChange={(e) => {
              setForm((f) => ({ ...f, acceptedTerms: e.target.checked }));
              setErrors((prev) => ({ ...prev, acceptedTerms: undefined }));
            }}
            aria-invalid={errors.acceptedTerms ? true : undefined}
          />
          <span>
            I agree to TagBack’s{' '}
            <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-semibold">Terms of Service</Link>{' '}
            and{' '}
            <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold">Privacy Policy</Link>.
          </span>
        </label>
        <FieldError msg={errors.acceptedTerms} />

        <motion.button className="btn btn-primary btn-lg w-full" disabled={busy} {...tapProps}>
          {busy && <Spinner size={18} />}
          {busy ? 'Creating…' : 'Create account'}
        </motion.button>
      </form>
      <p className="text-center text-muted mt-5 text-sm">Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="text-danger text-xs -mt-1 mb-2">{msg}</p>;
}
