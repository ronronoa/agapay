import type { ReactNode } from 'react';
import {
  CalendarDays,
  HandCoins,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageSquare,
  Package,
  ScrollText,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import { assistanceRequestListResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { DashboardShell, type DashboardNavItem } from './DashboardShell';

type AdminNavItem = DashboardNavItem & { badgeKey?: 'pendingRequests' | undefined };

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Donor', icon: Users },
  { to: '/admin/requests', label: 'Beneficiary', icon: UserRound, badgeKey: 'pendingRequests' },
  { to: '/admin/inventory', label: 'Inventory', icon: Package },
  { to: '/admin/campaigns', label: 'Campaign', icon: Megaphone },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { to: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/donations', label: 'Donations', icon: HandCoins },
  { to: '/admin/item-types', label: 'Item Types', icon: ListChecks },
  { to: '/admin/audit-logs', label: 'Audit Log', icon: ScrollText },
];

export function AdminShell({ children }: { children?: ReactNode }) {
  const pending = useApiQuery(
    ['admin-pending-requests'],
    '/api/v1/assistance-requests?status=PENDING&pageSize=1',
    assistanceRequestListResponseSchema,
  );
  const items: DashboardNavItem[] = ADMIN_NAV_ITEMS.map((item) => {
    const badge = item.badgeKey === undefined ? undefined : pending.data?.data.total;
    return badge === undefined
      ? { to: item.to, label: item.label, icon: item.icon, end: item.end }
      : { to: item.to, label: item.label, icon: item.icon, end: item.end, badge };
  });

  return <DashboardShell items={items}>{children}</DashboardShell>;
}
