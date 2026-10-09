import { toast as sonner } from 'sonner';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

// One toast API for the whole app (Sonner under the hood). Every success/error/
// warning/info notification routes through here so they look and behave the same
// everywhere: matching Lucide icons, design-token colors (styled in index.css),
// and built-in de-duplication.
//
// De-dupe: a toast's id defaults to `type:message`, so firing the same
// notification again (a rapid double-tap, a retried request) updates the live
// toast in place instead of stacking a second identical one. Pass an explicit
// `id` to override — e.g. to update a loading toast into a success/error.
//
//   notify.success('Item saved');
//   notify.error(err.message);
//   const id = notify.loading('Saving…');  notify.success('Saved', { id });
//   notify.promise(api.put(…), { loading: 'Saving…', success: 'Saved', error: (e) => e.message });

const ICONS = {
  success: <CheckCircle2 size={18} strokeWidth={2.4} />,
  error: <XCircle size={18} strokeWidth={2.4} />,
  warning: <AlertTriangle size={18} strokeWidth={2.4} />,
  info: <Info size={18} strokeWidth={2.4} />,
};

// Every toast dismisses after 2s.
const DURATION = { success: 2000, info: 2000, warning: 2000, error: 2000 };

const idFor = (type, message) => `${type}:${typeof message === 'string' ? message : ''}`;

function make(type) {
  return (message, opts = {}) =>
    sonner[type](message, {
      id: opts.id ?? idFor(type, message),
      icon: ICONS[type],
      duration: DURATION[type],
      ...opts,
    });
}

export const notify = {
  success: make('success'),
  error: make('error'),
  warning: make('warning'),
  info: make('info'),

  // Returns the toast id so callers can later resolve it via { id }.
  loading: (message, opts = {}) =>
    sonner.loading(message, { id: opts.id ?? idFor('loading', message), ...opts }),

  // Drives one toast through loading → success/error around a promise. `success`
  // and `error` may be strings or (result|err) => string.
  promise: (promise, msgs, opts = {}) =>
    sonner.promise(promise, {
      ...msgs,
      ...opts,
      success: (data) => ({
        message: typeof msgs.success === 'function' ? msgs.success(data) : msgs.success,
        icon: ICONS.success,
      }),
      error: (err) => ({
        message: typeof msgs.error === 'function' ? msgs.error(err) : msgs.error,
        icon: ICONS.error,
      }),
    }),

  dismiss: sonner.dismiss,
};

export default notify;
