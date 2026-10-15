import { NavLink, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, LogOut, FileText, ShieldCheck, ArrowLeft, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { Icon, useNavItems, usePendingRequests, NavBadge, PRIMARY_COUNT } from '../components/nav.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const MotionNavLink = motion.create(NavLink);

const rowClass =
  'flex items-center gap-[.85rem] w-full text-left px-4 py-[.9rem] border border-border rounded bg-card text-ink font-semibold text-[.95rem] shadow-brutal-sm cursor-pointer transition-colors hover:bg-surface hover:no-underline';

// Full-page "More" menu for small screens: all secondary navigation plus the
// account actions, laid out as rows. Reached from the bottom bar.
export default function More() {
  const { user, isAdmin, logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const items = useNavItems();
  const pending = usePendingRequests();
  const secondary = items.slice(PRIMARY_COUNT);
  // Back out to the previous page, falling back to the dashboard when there's no
  // in-app history to pop.
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'));

  function onLogout() {
    confirm({
      title: 'Log out?',
      description: 'You’ll need your username and password to sign back in.',
      confirmLabel: 'Log out',
      variant: 'default',
      icon: LogOut,
      onConfirm: () => {
        logout();
        navigate('/', { replace: true });
      },
    });
  }

  return (
    <div className="w-full">
      <motion.button type="button" onClick={goBack} className="btn btn-ghost btn-sm self-start mb-3 md:hidden" whileTap={{ scale: 0.98 }}>
        <ArrowLeft size={16} strokeWidth={2.5} /> Back
      </motion.button>
      <h1 className="mb-[1.1rem]">More</h1>

      <div className="card flex items-center gap-[.8rem]">
        <div className="flex-none w-[46px] h-[46px] grid place-items-center bg-primary text-white font-display font-bold text-[1.25rem] rounded-[12px] shadow-brutal-sm" aria-hidden="true">
          {(user?.name || user?.username || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <strong className="font-semibold">{user?.name || 'Account'}</strong>
          <span className="font-mono text-xs text-muted break-all">@{user?.username}</span>
        </div>
        {isAdmin && (
          <span className="text-[.58rem] font-bold uppercase tracking-wider bg-accent-weak text-primary rounded-full leading-[1.5]" style={{ padding: '.1rem .45rem' }}>ADMIN</span>
        )}
      </div>

      {secondary.length > 0 && (
        <>
          <h3 className="font-display text-muted text-[.74rem] font-semibold uppercase tracking-wide mt-5 mb-2.5">{isAdmin ? 'Admin tools' : 'More'}</h3>
          <nav className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[.6rem]">
            {secondary.map((it) => (
              <MotionNavLink key={it.to} to={it.to} className={rowClass} whileTap={{ scale: 0.98 }}>
                <span className="flex-none w-10 h-10 grid place-items-center bg-accent-weak text-primary rounded-sm"><Icon name={it.icon} size={19} /></span>
                <span className="flex flex-col leading-tight flex-1 min-w-0">
                  <strong className="flex items-center gap-2">{it.label}{it.badge === 'pending' && <NavBadge count={pending} />}</strong>
                  {it.desc && <small className="font-medium text-muted text-[.8rem]">{it.desc}</small>}
                </span>
                <ChevronRight className="text-muted" size={22} aria-hidden="true" />
              </MotionNavLink>
            ))}
          </nav>
        </>
      )}

      {/* Appearance control. Shown for everyone , including admins, whose chrome
          header has no toggle of its own, so this is their light/dark switch. */}
      <h3 className="font-display text-muted text-[.74rem] font-semibold uppercase tracking-wide mt-5 mb-2.5">Appearance</h3>
      <nav className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[.6rem]">
        <ThemeToggle variant="row" />
      </nav>

      <h3 className="font-display text-muted text-[.74rem] font-semibold uppercase tracking-wide mt-5 mb-2.5">Account</h3>
      <nav className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[.6rem]">
        <Link to="/account" className={rowClass}>
          <span className="flex-none w-10 h-10 grid place-items-center bg-accent-weak text-primary rounded-sm"><Settings size={19} /></span>
          <span className="flex flex-col leading-tight flex-1 min-w-0"><strong>Account security</strong><small className="font-medium text-muted text-[.8rem]">Password and active sessions</small></span>
          <ChevronRight className="text-muted" size={22} aria-hidden="true" />
        </Link>
      </nav>

      <h3 className="font-display text-muted text-[.74rem] font-semibold uppercase tracking-wide mt-5 mb-2.5">Legal</h3>
      <nav className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[.6rem]">
        <Link to="/legal/terms" className={rowClass}>
          <span className="flex-none w-10 h-10 grid place-items-center bg-accent-weak text-primary rounded-sm"><FileText size={19} strokeWidth={2} aria-hidden="true" /></span>
          <span className="flex flex-col leading-tight flex-1 min-w-0"><strong>Terms of Service</strong></span>
          <ChevronRight className="text-muted" size={22} aria-hidden="true" />
        </Link>
        <Link to="/legal/privacy" className={rowClass}>
          <span className="flex-none w-10 h-10 grid place-items-center bg-accent-weak text-primary rounded-sm"><ShieldCheck size={19} strokeWidth={2} aria-hidden="true" /></span>
          <span className="flex flex-col leading-tight flex-1 min-w-0"><strong>Privacy Policy</strong></span>
          <ChevronRight className="text-muted" size={22} aria-hidden="true" />
        </Link>
      </nav>

      <nav className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[.6rem] mt-5">
        <motion.button className={`${rowClass} text-danger`} onClick={onLogout} whileTap={{ scale: 0.98 }}>
          <span className="flex-none w-10 h-10 grid place-items-center bg-danger-weak text-danger rounded-sm"><Icon name="logout" size={19} /></span>
          <span className="flex flex-col leading-tight flex-1 min-w-0"><strong>Log out</strong></span>
          <ChevronRight className="text-muted" size={22} aria-hidden="true" />
        </motion.button>
      </nav>
    </div>
  );
}
