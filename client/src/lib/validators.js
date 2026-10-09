// Client-side auth validation. Mirrors the server's rules so users get instant
// feedback; the server re-validates everything regardless (never trust the client).

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// Returns an error string, or '' when the username is acceptable.
export function usernameError(raw) {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return 'Username is required';
  if (v.length < 3) return 'Username must be at least 3 characters';
  if (v.length > 20) return 'Username must be 20 characters or fewer';
  if (!USERNAME_RE.test(v)) return 'Only lowercase letters, numbers, and underscore';
  return '';
}

// 0–4 strength score + a label/color, for the signup strength meter.
export function passwordStrength(pw = '') {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const meta = [
    { label: 'Too weak', color: 'bg-danger' },
    { label: 'Weak', color: 'bg-danger' },
    { label: 'Fair', color: 'bg-primary' },
    { label: 'Good', color: 'bg-success' },
    { label: 'Strong', color: 'bg-success' },
  ][score];
  return { score, ...meta };
}

// The hard minimum the server enforces. Returns an error string or ''.
export function passwordError(pw = '') {
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(pw)) return 'Password must contain a letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number';
  return '';
}
