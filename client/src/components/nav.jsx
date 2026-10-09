import { LayoutGrid, Tag, Package, Users, List, MoreHorizontal, LogOut, BellRing } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useResource } from '../store/dataStore.js';
import { api } from '../lib/api.js';

// Lucide icon set (exclusive icon source for the app). Same <Icon name=…/> API
// the sidebar, bottom bar and /more page already call.
const ICONS = {
  home: LayoutGrid,
  tag: Tag,
  box: Package,
  users: Users,
  list: List,
  bell: BellRing,
  more: MoreHorizontal,
  logout: LogOut,
};

export const Icon = ({ name, className = '', size = 18 }) => {
  const Cmp = ICONS[name] || LayoutGrid;
  return <Cmp className={className} size={size} strokeWidth={2} aria-hidden="true" />;
};

// How many nav items stay in the mobile bottom bar (the rest live on /more).
export const PRIMARY_COUNT = 3;

// Role-aware nav model, shared by the desktop sidebar, the mobile bottom bar,
// and the /more page. First PRIMARY_COUNT entries are the core actions.
export function useNavItems() {
  const { isAdmin } = useAuth();
  const items = [
    { to: '/dashboard', label: 'Home', icon: 'home' },
    { to: '/activate', label: 'Activate', icon: 'tag' },
  ];
  if (isAdmin) {
    items.push(
      { to: '/inventory', label: 'Inventory', icon: 'box', desc: 'QR code stock & status' },
      { to: '/requests', label: 'Requests', icon: 'bell', desc: 'Pending activation requests', badge: 'pending' },
      { to: '/users', label: 'Users', icon: 'users', desc: 'Manage registered accounts' },
      { to: '/items', label: 'Items', icon: 'list', desc: 'All registered items' },
    );
  }
  return items;
}

// Number of pending activation requests, for the notification badge. Admins only;
// non-admins never hit the admin endpoint (a 403 there would kill their session).
// Shares the `admin/claims` cache key with the Activation Requests page, so an
// approve/reject there refreshes the badge too.
export function usePendingRequests() {
  const { isAdmin } = useAuth();
  const { data } = useResource(
    isAdmin ? 'admin/claims' : 'noop/claims',
    isAdmin ? () => api.get('/admin/claims').then((r) => r.claims) : () => Promise.resolve([]),
  );
  return data?.length || 0;
}

// Small count pill for a nav item with pending work. Renders nothing at 0.
export function NavBadge({ count, className = '' }) {
  if (!count) return null;
  return (
    <span
      className={`inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[.62rem] font-bold leading-none ${className}`}
      aria-label={`${count} pending`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
