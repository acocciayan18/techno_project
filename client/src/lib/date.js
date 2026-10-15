const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate();
    const seconds = value._seconds ?? value.seconds;
    if (seconds != null) return new Date(seconds * 1000);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toDate(value);
  return date ? DATE_FORMATTER.format(date) : 'N/A';
}
