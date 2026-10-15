// Live character counter for a text field. Sits under an input/textarea and
// shifts to the warn colour as the value nears its limit, danger if it somehow
// exceeds it (maxLength normally prevents that, but pasted/controlled values can
// momentarily overshoot). Purely presentational , the field itself owns the cap.
export default function CharCount({ value = '', max, className = '' }) {
  const len = [...String(value ?? '')].length;
  const over = len > max;
  const near = !over && len >= max * 0.9;
  const tone = over ? 'text-danger' : near ? 'text-warn' : 'text-muted-2';
  return (
    <span
      className={`block text-right text-[.72rem] tabular-nums mt-1 ${tone} ${className}`}
      aria-live="polite"
    >
      {len}/{max}
    </span>
  );
}
