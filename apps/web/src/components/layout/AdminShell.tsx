import type { ReactNode } from 'react';
import {
  CalendarDays,
  HandCoins,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageSquare,
  Package,
  PackageCheck,
  ScrollText,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import { adminDashboardResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { DashboardShell, type DashboardNavItem } from './DashboardShell';

type AdminNavItem = DashboardNavItem & { badgeKey?: 'pendingRequests' | undefined };

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, section: 'Overview' },
  { to: '/admin/campaigns', label: 'Campaigns', icon: Megaphone, section: 'Relief operations' },
  { to: '/admin/donations', label: 'Donations', icon: HandCoins, section: 'Relief operations' },
  {
    to: '/admin/requests',
    label: 'Requests',
    icon: UserRound,
    badgeKey: 'pendingRequests',
    section: 'Relief operations',
  },
  { to: '/admin/inventory', label: 'Inventory', icon: Package, section: 'Relief operations' },
  { to: '/admin/calendar', label: 'Calendar', icon: CalendarDays, section: 'Relief operations' },
  {
    to: '/admin/distributions',
    label: 'Distributions',
    icon: PackageCheck,
    section: 'Relief operations',
  },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquare, section: 'Support' },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'], section: 'Administration' },
  { to: '/admin/item-types', label: 'Item Types', icon: ListChecks, section: 'Administration' },
  { to: '/admin/audit-logs', label: 'Audit Log', icon: ScrollText, section: 'Administration' },
  {
    to: '/admin/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['ADMIN'],
    section: 'Administration',
  },
];

export function AdminShell({ children }: { children?: ReactNode }) {
  const pending = useApiQuery(
    ['admin-dashboard'],
    '/api/v1/dashboard/admin',
    adminDashboardResponseSchema,
  );
  const items: DashboardNavItem[] = ADMIN_NAV_ITEMS.map((item) => {
    const badge =
      item.badgeKey === undefined
        ? undefined
        : pending.data?.data.needsAttention.requestsAwaitingReview;
    return {
      to: item.to,
      label: item.label,
      icon: item.icon,
      end: item.end,
      roles: item.roles,
      section: item.section,
      ...(badge === undefined ? {} : { badge }),
    };
  });

  return <DashboardShell items={items}>{children}</DashboardShell>;
}
