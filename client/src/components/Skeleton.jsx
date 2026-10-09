// Skeleton loaders — placeholder shapes shown while content loads, instead of a
// bare "Loading…" line. Built from Tailwind + the design tokens so they match
// light/dark automatically. `bg-muted-bg` (surface-3) is the shimmer fill;
// `animate-pulse` is the motion (honours prefers-reduced-motion via index.css).

// Base block. Compose with width/height/rounding utilities.
export function Skeleton({ className = '', style }) {
  return <div className={`animate-pulse bg-muted-bg rounded-sm ${className}`} style={style} aria-hidden="true" />;
}

function srOnly(label) {
  return <span className="sr-only">{label}</span>;
}

// A row of stat tiles mirroring the real <Stat> layout.
export function SkeletonStats({ count = 3, className = '' }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${className}`} role="status" aria-live="polite">
      {srOnly('Loading statistics')}
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat">
          <Skeleton className="w-[30px] h-[30px] !rounded-[9px] mb-3" />
          <Skeleton className="h-7 w-16 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// Card grid matching the dashboard QR cards.
export function SkeletonCards({ count = 6, className = '' }) {
  return (
    <div className={`grid gap-4 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] ${className}`} role="status" aria-live="polite">
      {srOnly('Loading items')}
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex flex-col">
          <div className="flex justify-between items-center mb-2.5 gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-5 w-16 !rounded-full" />
          </div>
          <Skeleton className="w-full h-[150px]" />
          <Skeleton className="h-5 w-3/4 my-2.5" />
          <div className="flex flex-wrap gap-[.45rem] mt-auto">
            <Skeleton className="h-9 w-16 !rounded-xs" />
            <Skeleton className="h-9 w-20 !rounded-xs" />
            <Skeleton className="h-9 w-20 !rounded-xs" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Data table placeholder for the admin pages.
export function SkeletonTable({ cols = 4, rows = 6, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`} role="status" aria-live="polite">
      {srOnly('Loading table')}
      <table className="data-table">
        <thead>
          <tr>{Array.from({ length: cols }).map((_, i) => <th key={i}><Skeleton className="h-3 w-16" /></th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}><Skeleton className="h-4" style={{ width: `${55 + ((r + c) % 3) * 15}%` }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Form-card placeholder (edit/customize screens).
export function SkeletonForm({ fields = 3, className = '' }) {
  return (
    <div className={`card ${className}`} role="status" aria-live="polite">
      {srOnly('Loading form')}
      <Skeleton className="h-7 w-40 mb-5" />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="mb-4">
          <Skeleton className="h-3 w-24 mb-2" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 mt-2" />
    </div>
  );
}
