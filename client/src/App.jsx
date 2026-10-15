import { Navigate, Route, Routes, Link, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Toaster } from 'sonner';
import { QrCode } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { Icon, useNavItems, usePendingRequests, NavBadge, PRIMARY_COUNT } from './components/nav.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import { useShowOnScroll } from './lib/useScrollDirection.js';
import { useRealtime } from './lib/realtime.js';
import { CenterSpinner } from './components/Spinner.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ActivateQr from './pages/ActivateQr.jsx';
import ItemManage from './pages/ItemManage.jsx';
import QrView from './pages/QrView.jsx';
import PublicQr from './pages/PublicQr.jsx';
import Terms from './pages/legal/Terms.jsx';
import Privacy from './pages/legal/Privacy.jsx';
import AdminInventory from './pages/admin/AdminInventory.jsx';
import AdminRequests from './pages/admin/AdminRequests.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminItems from './pages/admin/AdminItems.jsx';
import More from './pages/More.jsx';
import Requests from './pages/Requests.jsx';
import Help from './pages/Help.jsx';

const MotionNavLink = motion.create(NavLink);

function ProtectedRoute({ children, admin }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <CenterSpinner label="Loading your account…" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function BrandMark() {
  return (
    <span className="flex-none w-[34px] h-[34px] grid place-items-center bg-primary text-white rounded-[10px] shadow-brutal-sm" aria-hidden="true">
      <QrCode size={19} strokeWidth={2} />
    </span>
  );
}

const topLinkBase = 'px-3 py-2 rounded-xs font-semibold text-sm whitespace-nowrap transition-colors';
const topLinkClass = ({ isActive }) =>
  `${topLinkBase} ${isActive
    ? 'bg-surface text-ink'
    : 'text-muted hover:bg-surface hover:text-ink hover:no-underline'}`;

// Desktop: sticky top bar. Brand + role-aware nav on the left, account controls
// (theme, admin tag, avatar, log out) on the right. Mobile uses the bottom bar.
function TopBar() {
  const { user, isAdmin } = useAuth();
  const items = useNavItems();
  const pending = usePendingRequests();
  const show = useShowOnScroll();
  const initial = (user?.name || user?.username || '?').charAt(0).toUpperCase();

  return (
    <header className={`hidden md:block sticky top-0 z-50 bg-bg/80 backdrop-blur-lg border-b border-border transition-transform duration-300 ease-out will-change-transform ${show ? 'translate-y-0' : '-translate-y-full'}`}>
      <div className="max-w-app mx-auto px-6 h-[60px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-2.5 text-ink hover:no-underline flex-none">
            <BrandMark />
            <strong className="font-display font-bold text-[1rem] tracking-tight">TagBack</strong>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {/* Only the core items here; admin pages (Requests, Users, Items)
                live under the More menu, same as the mobile bottom bar. */}
            {items.slice(0, PRIMARY_COUNT).map((it) => (
              <MotionNavLink key={it.to} to={it.to} className={topLinkClass} whileTap={{ scale: 0.97 }}>
                <span className="inline-flex items-center gap-1.5">
                  {it.label}
                  {it.badge === 'pending' && <NavBadge count={pending} />}
                </span>
              </MotionNavLink>
            ))}
            {/* Same destination as the mobile bottom bar's More tab: legal links,
                theme and account actions live on /more on desktop too. */}
            <MotionNavLink to="/more" className={topLinkClass} whileTap={{ scale: 0.97 }}>
              <span className="inline-flex items-center gap-1.5">More</span>
            </MotionNavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2.5 flex-none">
          {isAdmin && <RoleTag />}
          <NotificationBell />
          <span className="avatar w-9 h-9 text-[.82rem]" title={user?.username}>{initial}</span>
        </div>
      </div>
    </header>
  );
}

export function RoleTag() {
  return (
    <span className="text-[.58rem] font-bold uppercase tracking-wider bg-accent-weak text-primary rounded-full leading-[1.5]" style={{ padding: '.1rem .45rem' }}>
      ADMIN
    </span>
  );
}

// Mobile: fixed bottom bar. Only the core actions stay; everything else
// (extra/admin pages + Log out) lives on the dedicated /more page.
function BottomNav() {
  const items = useNavItems();
  const location = useLocation();
  const pending = usePendingRequests();

  const primary = items.slice(0, PRIMARY_COUNT);
  const overflow = items.slice(PRIMARY_COUNT);

  const moreActive =
    location.pathname.startsWith('/more') ||
    overflow.some((it) => location.pathname.startsWith(it.to));
  // A pending request reachable only from the More menu needs its dot there too.
  const overflowPending = overflow.some((it) => it.badge === 'pending') && pending > 0;

  const base =
    'flex-1 min-w-[62px] min-h-[56px] flex flex-col items-center justify-center gap-1 text-[.66rem] font-semibold hover:no-underline transition-colors';
  const cls = (active) =>
    `${base} ${active ? 'text-primary' : 'text-muted-2'}`;

  return (
    <nav className="fixed left-0 right-0 bottom-0 z-[60] flex md:hidden bg-card/90 backdrop-blur-lg border-t border-border overflow-x-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {primary.map((it) => (
        <NavLink key={it.to} to={it.to} className={({ isActive }) => cls(isActive)}>
          <span className="relative">
            <Icon name={it.icon} size={20} />
            {it.badge === 'pending' && <NavBadge count={pending} className="absolute -top-1.5 -right-2.5" />}
          </span>
          <span>{it.label}</span>
        </NavLink>
      ))}
      <NavLink to="/more" className={cls(moreActive)}>
        <span className="relative">
          <Icon name="more" size={20} />
          {overflowPending && <NavBadge count={pending} className="absolute -top-1.5 -right-2.5" />}
        </span>
        <span>More</span>
      </NavLink>
    </nav>
  );
}

// Chrome:
//  - /q/ finder pages are bare (no app shell).
//  - Signed-out pages (login/register) get a minimal centered shell.
//  - Signed-in app gets the sidebar + mobile bottom bar.
function Chrome({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  // The marketing landing page ('/') and public finder/legal routes bring their
  // own full-width chrome, so they bypass both the app shell and the auth shell.
  const bare =
    location.pathname === '/' ||
    location.pathname.startsWith('/q/') ||
    location.pathname.startsWith('/legal/');

  if (bare) {
    return (
      <main className="min-h-screen relative z-[1]">{children}</main>
    );
  }

  if (!user) {
    return (
      <main className="max-w-[520px] mx-auto px-4 py-10 relative z-[1] min-h-screen flex flex-col justify-center">
        <div className="flex items-center gap-2.5 justify-center mb-6 text-ink">
          <BrandMark />
          <strong className="font-display font-bold text-[1.05rem] tracking-tight">TagBack</strong>
        </div>
        {children}
        <footer className="mt-5 text-center text-[.8rem] text-muted-2">
          <Link to="/legal/terms" className="hover:text-ink">Terms</Link>
          <span className="mx-2">·</span>
          <Link to="/legal/privacy" className="hover:text-ink">Privacy</Link>
        </footer>
      </main>
    );
  }

  return (
    <>
      <TopBar />
      <main className="relative z-[1] min-h-screen">
        <div className="max-w-app mx-auto px-4 md:px-6 pt-[1.1rem] md:pt-6 pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-8">
          {children}
        </div>
      </main>
      <BottomNav />
    </>
  );
}

// App-wide toast host. Styling comes entirely from design tokens (see the Sonner
// block in index.css), so toasts flip for light/dark with the rest of the UI and
// Sonner's own theme never fights ours. Top-center keeps them clear of the mobile
// bottom nav. Rendered OUTSIDE the app's `<main>` (which is `relative z-[1]`, a
// stacking context that would trap the toasts below the z-50 sticky top bar), and
// offset down past the 60px desktop top bar so notifications are never covered.
// See lib/toast.jsx for the `notify` API callers use.
function AppToaster() {
  return (
    <Toaster
      position="top-center"
      gap={10}
      offset={{ top: 'calc(60px + 1rem)' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
      toastOptions={{ className: 'tb-toast', duration: 2000 }}
      style={{
        '--normal-bg': 'rgb(var(--card))',
        '--normal-border': 'rgb(var(--border-strong))',
        '--normal-text': 'rgb(var(--ink))',
        '--border-radius': '12px',
      }}
    />
  );
}

export default function App() {
  const { user } = useAuth();
  // One app-wide real-time connection; no-op while signed out. Live updates for
  // notifications, QR status, activation requests and dashboards (see lib/realtime.js).
  useRealtime();
  return (
    <>
      <AppToaster />
      <Chrome>
        <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/activate" element={<ProtectedRoute><ActivateQr /></ProtectedRoute>} />
        <Route path="/qr/:qrId" element={<ProtectedRoute><QrView /></ProtectedRoute>} />
        <Route path="/qr/:qrId/item" element={<ProtectedRoute><ItemManage /></ProtectedRoute>} />
        {/* Legacy customize link folds into the unified manage page. */}
        <Route path="/qr/:qrId/customize" element={<Navigate to="../item" replace />} />
        <Route path="/more" element={<ProtectedRoute><More /></ProtectedRoute>} />
        <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
        {/* User's own activation-request tracker. */}
        <Route path="/my-requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />

        {/* Admin-only feature pages — same app, same chrome, gated by role. */}
        <Route path="/requests" element={<ProtectedRoute admin><AdminRequests /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute admin><AdminInventory /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute admin><AdminUsers /></ProtectedRoute>} />
        <Route path="/items" element={<ProtectedRoute admin><AdminItems /></ProtectedRoute>} />
        {/* Legacy /admin/* links redirect into the unified routes. */}
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/inventory" element={<Navigate to="/inventory" replace />} />
        <Route path="/admin/users" element={<Navigate to="/users" replace />} />
        <Route path="/admin/items" element={<Navigate to="/items" replace />} />

        {/* Public finder route — the permanent URL a physical QR encodes. */}
        <Route path="/q/:qrId" element={<PublicQr />} />

        {/* Standalone legal pages — reachable signed-in or signed-out. */}
        <Route path="/legal/terms" element={<Terms />} />
        <Route path="/legal/privacy" element={<Privacy />} />

        <Route path="*" element={<div className="py-10 px-4 text-center font-semibold text-muted text-lg">Page not found.</div>} />
        </Routes>
      </Chrome>
    </>
  );
}
