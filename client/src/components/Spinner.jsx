import { Loader2 } from 'lucide-react';

// The single spinner used everywhere (buttons, inline, full-page). Lucide-only,
// Tailwind `animate-spin`. Size matches the icon it stands in for.
export default function Spinner({ size = 16, strokeWidth = 2.5, className = '' }) {
  return <Loader2 size={size} strokeWidth={strokeWidth} className={`animate-spin ${className}`} aria-hidden="true" />;
}

// Centered full-area loader for app boot / finder pages where a skeleton of the
// final layout isn't meaningful.
export function CenterSpinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`py-16 px-4 flex flex-col items-center justify-center gap-3 text-muted ${className}`} role="status" aria-live="polite">
      <Spinner size={26} className="text-primary" />
      <span className="font-semibold text-sm">{label}</span>
    </div>
  );
}
