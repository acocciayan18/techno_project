import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, PackageSearch, CheckCheck } from 'lucide-react';
import { useNotifications, relativeTime } from '../lib/useNotifications.js';
import { NavBadge } from './nav.jsx';
import Spinner from './Spinner.jsx';
import { tapProps } from './motion.jsx';

// Nav bell + dropdown panel for owner notifications (finder "I found this"
// reports). Reused on desktop (top bar) and mobile (dashboard header). Opening the
// panel does NOT mark everything read — the owner reads items individually (click
// through to the QR) or taps "Mark all read", so the badge stays honest.
export default function NotificationBell({ align = 'right' }) {
  const { list, unread, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click or Esc — standard dropdown dismissal.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openNotification(n) {
    markRead(n.id);
    setOpen(false);
    navigate(`/qr/${n.qrId}`);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <motion.button
        type="button"
        className="relative w-9 h-9 grid place-items-center rounded-xs text-muted border border-border bg-card hover:bg-surface hover:text-ink transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.95 }}
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        title="Notifications"
      >
        <BellRing size={17} strokeWidth={2} />
        {unread > 0 && <NavBadge count={unread} className="absolute -top-1.5 -right-1.5" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
            className={`absolute z-[70] mt-2 w-[330px] max-w-[calc(100vw-2rem)] bg-card border border-border-strong rounded-lg shadow-brutal-lg overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
            role="menu"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
              <span className="font-display font-bold text-[.95rem]">Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  onClick={() => markAllRead()}
                >
                  <CheckCheck size={14} strokeWidth={2.4} /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[min(70vh,380px)] overflow-y-auto">
              {loading && list.length === 0 ? (
                <div className="flex justify-center py-8"><Spinner size={20} /></div>
              ) : list.length === 0 ? (
                <div className="flex flex-col items-center text-center gap-2 px-5 py-9">
                  <span className="w-11 h-11 grid place-items-center rounded-full bg-surface text-muted-2">
                    <PackageSearch size={22} strokeWidth={2} />
                  </span>
                  <p className="text-muted text-sm m-0">No notifications yet.</p>
                  <p className="text-muted-2 text-xs m-0">
                    When a finder reports one of your lost items, it shows up here.
                  </p>
                </div>
              ) : (
                list.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-border last:border-0 cursor-pointer transition-colors hover:bg-surface ${n.read ? '' : 'bg-accent-weak/40'}`}
                    role="menuitem"
                  >
                    <span className="flex-none mt-0.5">
                      <span className={`w-2 h-2 rounded-full block ${n.read ? 'bg-transparent' : 'bg-danger'}`} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[.9rem] leading-snug text-ink break-words">
                        Someone reported finding{' '}
                        <strong className="font-semibold">{n.itemName || 'your item'}</strong>.
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[.72rem] text-muted-2">
                        <span className="font-mono font-semibold bg-surface border border-border rounded-xs px-1.5 py-0.5">{n.qrId}</span>
                        <span title={n.createdAt || ''}>{relativeTime(n.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>

            {list.length > 0 && (
              <div className="px-4 py-2.5 border-t border-border bg-surface/60">
                <p className="text-[.7rem] text-muted-2 m-0 leading-snug">
                  A report is a sighting from a finder — it doesn’t confirm the item was returned.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
