import { Link } from 'react-router-dom';
import {
  assistanceRequestListResponseSchema,
  auditListResponseSchema,
  calendarEventListResponseSchema,
  campaignListResponseSchema,
  distributionListResponseSchema,
  donationListResponseSchema,
  inventoryListResponseSchema,
} from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Reveal } from '../../components/ui/reveal';

function weekdayBuckets(dates: string[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const iso of dates) {
    const day = new Date(iso).getDay();
    const slot = (day + 6) % 7;
    const current: number | undefined = buckets[slot];
    buckets[slot] = (current ?? 0) + 1;
  }
  return buckets;
}

function manilaDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => `${(index / 6) * 280 + 10},${70 - (value / max) * 55}`)
    .join(' ');
  return (
    <svg viewBox="0 0 300 80" className="mt-2 h-16 w-full" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="#4c7273" strokeWidth="2" />
    </svg>
  );
}

function NeedCard({
  title,
  count,
  actionLabel,
  to,
  ready,
}: {
  title: string;
  count: number | null;
  actionLabel: string;
  to?: string;
  ready?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <p className="text-sm text-text-muted">{title}</p>
      <p className="mt-1 text-3xl font-bold">{count === null ? '…' : count}</p>
      {to === undefined || ready === false ? (
        <span
          aria-disabled="true"
          title="This queue arrives with the admin slice"
          className="mt-3 inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium opacity-60"
        >
          {actionLabel} (soon)
        </span>
      ) : (
        <Link
          to={to}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function AdminDashboardPage() {
  const pendingDonations = useApiQuery(
    ['dash-don'],
    '/api/v1/donations?status=PENDING&pageSize=1',
    donationListResponseSchema,
  );
  const pendingRequests = useApiQuery(
    ['dash-req'],
    '/api/v1/assistance-requests?status=PENDING&pageSize=1',
    assistanceRequestListResponseSchema,
  );
  const lowStock = useApiQuery(
    ['dash-low'],
    '/api/v1/inventory?lowStock=true&pageSize=1',
    inventoryListResponseSchema,
  );
  const todayEvents = useApiQuery(
    ['dash-events'],
    '/api/v1/calendar/events?type=DISTRIBUTION&pageSize=100',
    calendarEventListResponseSchema,
  );
  const recentDonations = useApiQuery(
    ['dash-donations'],
    '/api/v1/donations?pageSize=100',
    donationListResponseSchema,
  );
  const completedDistributions = useApiQuery(
    ['dash-dist'],
    '/api/v1/distributions?status=DISTRIBUTED&pageSize=100',
    distributionListResponseSchema,
  );
  const served = useApiQuery(
    ['dash-served'],
    '/api/v1/assistance-requests?status=DISTRIBUTED&pageSize=1',
    assistanceRequestListResponseSchema,
  );
  const verified = useApiQuery(
    ['dash-verified'],
    '/api/v1/donations?status=VERIFIED&pageSize=1',
    donationListResponseSchema,
  );
  const activeCampaigns = useApiQuery(
    ['dash-camp'],
    '/api/v1/campaigns?status=ACTIVE&pageSize=1',
    campaignListResponseSchema,
  );
  const inventory = useApiQuery(
    ['dash-inv'],
    '/api/v1/inventory?pageSize=100',
    inventoryListResponseSchema,
  );
  const audit = useApiQuery(['dash-audit'], '/api/v1/audit-logs', auditListResponseSchema);

  const activity = weekdayBuckets(
    (recentDonations.data?.data.items ?? []).map((row) => row.submittedAt),
  );
  const distributedUnits = (completedDistributions.data?.data.items ?? []).reduce(
    (sum, dist) => sum + dist.items.reduce((inner, item) => inner + item.quantity, 0),
    0,
  );
  const topStock = [...(inventory.data?.data.items ?? [])]
    .sort((a, b) => b.available - a.available)
    .slice(0, 4);
  const recentAudit = (audit.data?.data.items ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Operations at a glance. Open a queue to review donations, requests, or low stock."
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NeedCard
          title="Donations awaiting verification"
          count={pendingDonations.data?.data.total ?? null}
          actionLabel="Review"
          to="/admin/donations"
          ready
        />
        <NeedCard
          title="Assistance requests"
          count={pendingRequests.data?.data.total ?? null}
          actionLabel="Review"
          to="/admin/requests"
          ready
        />
        <NeedCard
          title="Distributions today"
          count={
            todayEvents.data === null
              ? null
              : todayEvents.data.data.items.filter(
                  (event) => manilaDay(event.startAt) === manilaDay(new Date().toISOString()),
                ).length
          }
          actionLabel="Calendar"
        />
        <NeedCard
          title="Low stock"
          count={lowStock.data?.data.total ?? null}
          actionLabel="View"
          to="/admin/inventory"
          ready
        />
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <p className="text-sm text-text-muted">Donation activity by weekday, recent records</p>
          <Sparkline values={activity} label="Donations per weekday" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <p className="text-sm text-text-muted">Goods distributed, all time</p>
          <p className="mt-1 text-3xl font-bold">{distributedUnits.toLocaleString()}</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <p className="text-sm text-text-muted">Beneficiaries served</p>
            <p className="mt-1 text-3xl font-bold">{served.data?.data.total ?? '…'}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <p className="text-sm text-text-muted">Active campaigns</p>
            <p className="mt-1 text-3xl font-bold">{activeCampaigns.data?.data.total ?? '…'}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <p className="text-sm text-text-muted">Verified donations</p>
            <p className="mt-1 text-3xl font-bold">{verified.data?.data.total ?? '…'}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <p className="text-sm text-text-muted">Donation activity</p>
          <ul className="mt-2 space-y-2 text-sm">
            {(recentDonations.data?.data.items ?? []).slice(0, 5).map((row) => (
              <li key={row.id} className="flex justify-between gap-2">
                <span className="font-medium">{row.referenceNumber}</span>
                <span className="text-text-muted">{row.campaignName}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <p className="text-sm text-text-muted">Inventory overview</p>
          <ul className="mt-2 space-y-2 text-sm">
            {topStock.map((row) => (
              <li key={row.id} className="flex justify-between gap-2">
                <span className="font-medium">{row.itemTypeName}</span>
                <span>{row.available}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <p className="text-sm text-text-muted">Recent activities</p>
          <ul className="mt-2 space-y-2 text-sm">
            {recentAudit.map((entry) => (
              <li key={entry.id} className="flex justify-between gap-2">
                <span className="font-medium">{entry.action}</span>
                <span className="text-text-muted">
                  {new Date(entry.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
