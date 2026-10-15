import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

// Password field with a leading lock icon and a trailing show/hide toggle.
// Purely presentational , the owning form keeps the value and change handler.
export default function PasswordInput({
  value,
  onChange,
  autoComplete = 'current-password',
  invalid = false,
  required = false,
  placeholder,
  id,
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="inp-icon mt-1.5">
      <Lock />
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="inp-trail"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        tabIndex={-1}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
