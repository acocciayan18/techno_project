import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ShieldAlert, HelpCircle } from 'lucide-react';
import { tapProps } from './motion.jsx';
import Spinner from './Spinner.jsx';

// App-wide confirmation modal for destructive or sensitive actions (deleting a
// record, disabling a QR / account, logging out). One instance lives at the root
// (ConfirmProvider); components ask for a confirmation imperatively:
//
//   const confirm = useConfirm();
//   await confirm({
//     title: 'Delete QR-00042?',
//     description: 'This can’t be undone.',
//     confirmLabel: 'Delete permanently',
//     variant: 'danger',
//     onConfirm: () => api.del(...),   // optional async action, see below
//   });
//
// Two ways to use the returned promise:
//  - Pass `onConfirm`: the modal runs it, shows a spinner on the Confirm button,
//    blocks a second submit, stays open if it throws (so the caller's toast can
//    report the error and the user can retry), and closes + resolves `true` on
//    success. This is the recommended path — duplicate-submission guarding and
//    the busy state are handled here, consistently, for every caller.
//  - Omit `onConfirm`: the promise resolves `true` when the user confirms and
//    `false` when they cancel, leaving the work to the caller.
//
// Cancel, backdrop click and Esc all resolve `false`. While the action is in
// flight none of them fire, so an irreversible action can't be interrupted
// half-way, and normal (non-destructive) flows are never touched.

const ConfirmContext = createContext(null);

// Per-variant accent: icon, icon chip color, and the Confirm button style. Colors
// come straight from the design tokens already used across the app.
const VARIANTS = {
  danger: { Icon: AlertTriangle, chip: 'bg-danger-weak text-danger', btn: 'btn-danger', border: '!border-danger' },
  warning: { Icon: ShieldAlert, chip: 'bg-warn-weak text-warn', btn: 'btn-primary', border: '!border-warn' },
  default: { Icon: HelpCircle, chip: 'bg-accent-weak text-primary', btn: 'btn-primary', border: '' },
};

export function ConfirmProvider({ children }) {
  // The live request, or null when the modal is closed. `resolve` settles the
  // promise handed back to the caller.
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(false);
  const resolveRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const cancelBtnRef = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setBusy(false);
      setReq(options);
    });
  }, []);

  // Settle with `false` and close. No-op while an action is running so the modal
  // can't be dismissed mid-flight.
  const cancel = useCallback(() => {
    if (busy) return;
    resolveRef.current?.(false);
    resolveRef.current = null;
    setReq(null);
  }, [busy]);

  const handleConfirm = useCallback(async () => {
    if (!req || busy) return; // duplicate-submit guard
    const onConfirm = req.onConfirm;
    if (!onConfirm) {
      resolveRef.current?.(true);
      resolveRef.current = null;
      setReq(null);
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
      resolveRef.current?.(true);
      resolveRef.current = null;
      setReq(null);
    } catch {
      // Leave the modal open so the caller's error toast is visible and the user
      // can retry or cancel. The caller owns error messaging.
      setBusy(false);
    }
  }, [req, busy]);

  // Esc cancels; lock body scroll and move focus to a safe default (Cancel for a
  // destructive action, Confirm otherwise) while open.
  useEffect(() => {
    if (!req) return;
    const onKey = (e) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTarget = req.variant === 'danger' ? cancelBtnRef.current : confirmBtnRef.current;
    const t = setTimeout(() => focusTarget?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [req, cancel]);

  const v = VARIANTS[req?.variant] || VARIANTS.danger;
  const Icon = req?.icon || v.Icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {createPortal(
        <AnimatePresence>
          {req && (
            <>
              <motion.div
                key="confirm-backdrop"
                className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={cancel}
              />
              <div className="fixed inset-0 z-[91] grid place-items-center p-4 pointer-events-none">
                <motion.div
                  key="confirm-panel"
                  className={`card !mb-0 w-full max-w-[420px] pointer-events-auto shadow-brutal ${v.border}`}
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="confirm-title"
                  aria-describedby="confirm-desc"
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex-none w-10 h-10 grid place-items-center rounded-[10px] ${v.chip}`}>
                      <Icon size={20} strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 id="confirm-title" className="font-display font-bold text-lg m-0 leading-snug">
                        {req.title}
                      </h2>
                      {req.description && (
                        <div id="confirm-desc" className="text-sm text-muted mt-1.5 leading-relaxed">
                          {req.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2.5 justify-end mt-5">
                    <motion.button
                      ref={cancelBtnRef}
                      type="button"
                      className="btn"
                      onClick={cancel}
                      disabled={busy}
                      {...tapProps}
                    >
                      {req.cancelLabel || 'Cancel'}
                    </motion.button>
                    <motion.button
                      ref={confirmBtnRef}
                      type="button"
                      className={`btn ${v.btn}`}
                      onClick={handleConfirm}
                      disabled={busy}
                      {...tapProps}
                    >
                      {busy && <Spinner size={16} />}
                      {busy ? req.busyLabel || 'Working…' : req.confirmLabel || 'Confirm'}
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}

// Returns `confirm(options) => Promise<boolean>`. See the file header for options.
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}

export default ConfirmProvider;
