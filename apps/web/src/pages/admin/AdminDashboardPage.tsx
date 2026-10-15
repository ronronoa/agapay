import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Printer,
  ScrollText,
  ShieldCheck,
  UserCheck,
  Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  assistanceRequestListResponseSchema,
  auditListResponseSchema,
  calendarEventListResponseSchema,
  campaignListResponseSchema,
  distributionListResponseSchema,
  donationListResponseSchema,
  inventoryListResponseSchema,
} from '@agapay/shared';
import type { z } from 'zod';
import { useApiQuery } from '../../lib/use-api-query';
import { Reveal } from '../../components/ui/reveal';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Manila has no DST, so month and week boundaries are shifted-UTC math.
function manilaMonthRange(monthDelta: number): { from: string; to: string } {
  const shifted = new Date(Date.now() + MANILA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + monthDelta;
  return {
    from: new Date(Date.UTC(year, month, 1) - MANILA_OFFSET_MS).toISOString(),
    to: new Date(Date.UTC(year, month + 1, 1) - MANILA_OFFSET_MS).toISOString(),
  };
}

function manilaWeekStart(weeksAgo: number): string {
  const shifted = new Date(Date.now() + MANILA_OFFSET_MS);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday - weeksAgo * 7,
  );
  return new Date(monday - MANILA_OFFSET_MS).toISOString();
}

function manilaDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

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

function useTotal<T extends { data: { total: number } }>(
  key: string,
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): number | null {
  const query = useApiQuery([key], path, schema);
  return query.data?.data.total ?? null;
}

// A percentage only when both periods are known and the comparison period is
// non-zero: an absent baseline is not a trend.
function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        up ? 'bg-success-bg text-success-text' : 'bg-warning-bg text-warning-text'
      }`}
    >
      {up ? (
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
      )}
      <span className="sr-only">{up ? 'up ' : 'down '}</span>
      {Math.abs(pct)}%
    </span>
  );
}

function AttentionCard({
  icon: Icon,
  title,
  count,
  actionLabel,
  to,
  highlighted,
}: {
  icon: LucideIcon;
  title: string;
  count: number | null;
  actionLabel: string;
  to?: string;
  highlighted?: boolean;
}): ReactNode {
  return (
    <div
      className={`rounded-xl border bg-surface p-5 shadow-card ${
        highlighted === true ? 'border-primary' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-alt text-pine"
        >
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-text-muted">{title}</p>
      </div>
      <p className="mt-3 text-3xl font-bold">{count === null ? '…' : count}</p>
      {to === undefined ? (
        <span
          aria-disabled="true"
          title="This queue arrives with the admin slice"
          className="mt-3 inline-flex min-h-[40px] cursor-not-allowed items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-medium opacity-60"
        >
          {actionLabel} (soon)
        </span>
      ) : (
        <Link
          to={to}
          className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-full bg-primary-subtle px-5 py-2 text-sm font-medium text-surface hover:bg-pine-dark"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: number | null;
  current?: number | null;
  previous?: number | null;
}): ReactNode {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-text-muted">{label}</p>
        <Delta current={current ?? null} previous={previous ?? null} />
      </div>
      <p className="mt-1 text-3xl font-bold">{value === null ? '…' : value.toLocaleString()}</p>
    </div>
  );
}

export function AdminDashboardPage() {
  const thisMonth = manilaMonthRange(0);
  const lastMonth = manilaMonthRange(-1);
  const weekStart = manilaWeekStart(0);
  const previousWeekStart = manilaWeekStart(1);
  const nextWeekStart = manilaWeekStart(-1);

  const pendingDonations = useTotal(
    'dash-don',
    '/api/v1/donations?status=PENDING&pageSize=1',
    donationListResponseSchema,
  );
  const pendingRequests = useTotal(
    'dash-req',
    '/api/v1/assistance-requests?status=PENDING&pageSize=1',
    assistanceRequestListResponseSchema,
  );
  const lowStock = useTotal(
    'dash-low',
    '/api/v1/inventory?lowStock=true&pageSize=1',
    inventoryListResponseSchema,
  );
  const eventsQuery = useApiQuery(
    ['dash-events'],
    '/api/v1/calendar/events?type=DISTRIBUTION&pageSize=100',
    calendarEventListResponseSchema,
  );

  const thisWeekQuery = useApiQuery(
    ['dash-week'],
    `/api/v1/donations?from=${weekStart}&to=${nextWeekStart}&pageSize=100`,
    donationListResponseSchema,
  );
  const lastWeekDonations = useTotal(
    'dash-week-prev',
    `/api/v1/donations?from=${previousWeekStart}&to=${weekStart}&pageSize=1`,
    donationListResponseSchema,
  );
  const thisWeekDonations = thisWeekQuery.data?.data.total ?? null;

  const thisMonthDist = useApiQuery(
    ['dash-dist-cur'],
    `/api/v1/distributions?status=DISTRIBUTED&from=${thisMonth.from}&to=${thisMonth.to}&pageSize=100`,
    distributionListResponseSchema,
  );
  const lastMonthDist = useApiQuery(
    ['dash-dist-prev'],
    `/api/v1/distributions?status=DISTRIBUTED&from=${lastMonth.from}&to=${thisMonth.from}&pageSize=100`,
    distributionListResponseSchema,
  );
  const lastWeekDist = useApiQuery(
    ['dash-dist-week'],
    `/api/v1/distributions?status=DISTRIBUTED&from=${previousWeekStart}&to=${weekStart}&pageSize=100`,
    distributionListResponseSchema,
  );
  const distributedUnits = (
    items: readonly { items: readonly { quantity: number }[] }[] | undefined,
  ): number =>
    (items ?? []).reduce(
      (sum, row) => sum + row.items.reduce((inner, item) => inner + item.quantity, 0),
      0,
    );

  const servedTotal = useTotal(
    'dash-served',
    '/api/v1/assistance-requests?status=DISTRIBUTED&pageSize=1',
    assistanceRequestListResponseSchema,
  );
  const servedThisMonth = useTotal(
    'dash-served-cur',
    `/api/v1/assistance-requests?status=DISTRIBUTED&from=${thisMonth.from}&to=${thisMonth.to}&pageSize=1`,
    assistanceRequestListResponseSchema,
  );
  const servedLastMonth = useTotal(
    'dash-served-prev',
    `/api/v1/assistance-requests?status=DISTRIBUTED&from=${lastMonth.from}&to=${thisMonth.from}&pageSize=1`,
    assistanceRequestListResponseSchema,
  );
  const verifiedTotal = useTotal(
    'dash-verified',
    '/api/v1/donations?status=VERIFIED&pageSize=1',
    donationListResponseSchema,
  );
  const verifiedThisMonth = useTotal(
    'dash-verified-cur',
    `/api/v1/donations?status=VERIFIED&from=${thisMonth.from}&to=${thisMonth.to}&pageSize=1`,
    donationListResponseSchema,
  );
  const verifiedLastMonth = useTotal(
    'dash-verified-prev',
    `/api/v1/donations?status=VERIFIED&from=${lastMonth.from}&to=${thisMonth.from}&pageSize=1`,
    donationListResponseSchema,
  );
  const activeCampaigns = useTotal(
    'dash-camp',
    '/api/v1/campaigns?status=ACTIVE&pageSize=1',
    campaignListResponseSchema,
  );
  const inventoryQuery = useApiQuery(
    ['dash-inv'],
    '/api/v1/inventory?pageSize=100',
    inventoryListResponseSchema,
  );
  const auditQuery = useApiQuery(['dash-audit'], '/api/v1/audit-logs', auditListResponseSchema);

  const events = eventsQuery.data?.data.items ?? [];
  const today = manilaDay(new Date().toISOString());
  const distributionsToday = events.filter((event) => manilaDay(event.startAt) === today).length;
  const upcoming = events
    .filter((event) => event.status === 'SCHEDULED' && manilaDay(event.startAt) >= today)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 4);

  const activityByWeekday = weekdayBuckets(
    (thisWeekQuery.data?.data.items ?? []).map((row) => row.submittedAt),
  );
  const chartData = WEEKDAYS.map((day, index) => ({
    day,
    count: activityByWeekday[index] ?? 0,
  }));

  const inventory = [...(inventoryQuery.data?.data.items ?? [])]
    .sort((a, b) => b.available - a.available)
    .slice(0, 4);
  const stockMax = Math.max(...inventory.map((row) => row.available), 1);
  const recentAudit = (auditQuery.data?.data.items ?? []).slice(0, 5);

  const rangeStart = new Date(thisMonth.from);
  const rangeEnd = new Date(new Date(thisMonth.to).getTime() - 1);
  const rangeLabel = `${rangeStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString(
    'en-PH',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    },
  )}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Needs your attention</h2>
          <p className="text-sm text-text-muted">{rangeLabel}</p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Printing arrives in a later release"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print report
        </button>
      </div>

      <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AttentionCard
          icon={ShieldCheck}
          title="Donations awaiting verification"
          count={pendingDonations}
          actionLabel="Review"
          to="/admin/donations"
          highlighted
        />
        <AttentionCard
          icon={UserCheck}
          title="Assistance requests"
          count={pendingRequests}
          actionLabel="Review"
          to="/admin/requests"
          highlighted
        />
        <AttentionCard
          icon={CalendarDays}
          title="Distribution today"
          count={distributionsToday}
          actionLabel="Calendar"
        />
        <AttentionCard
          icon={Warehouse}
          title="Low stock"
          count={lowStock}
          actionLabel="View"
          to="/admin/inventory"
        />
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Donation activity · this week</h2>
            <Delta current={thisWeekDonations} previous={lastWeekDonations} />
          </div>
          <div className="mt-4 h-56" role="img" aria-label="Donations per weekday this week">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="donationArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary-subtle)" stopOpacity={0.3} />
                    <stop
                      offset="100%"
                      stopColor="var(--color-primary-subtle)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--color-border)' }}
                  contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-primary-subtle)"
                  strokeWidth={2}
                  fill="url(#donationArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Goods distributed / month</h2>
            <Delta
              current={distributedUnits(thisMonthDist.data?.data.items)}
              previous={distributedUnits(lastMonthDist.data?.data.items)}
            />
          </div>
          <p className="mt-3 text-3xl font-bold">
            {distributedUnits(thisMonthDist.data?.data.items).toLocaleString('en-PH')}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <p className="text-sm text-text-muted">Last month</p>
              <p className="mt-1 text-xl font-semibold">
                {distributedUnits(lastMonthDist.data?.data.items).toLocaleString('en-PH')}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Last week</p>
              <p className="mt-1 text-xl font-semibold">
                {distributedUnits(lastWeekDist.data?.data.items).toLocaleString('en-PH')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Reveal className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Beneficiaries served"
          value={servedTotal}
          current={servedThisMonth}
          previous={servedLastMonth}
        />
        <StatCard label="Active campaigns" value={activeCampaigns} />
        <StatCard
          label="Verified donations"
          value={verifiedTotal}
          current={verifiedThisMonth}
          previous={verifiedLastMonth}
        />
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <h2 className="text-sm font-semibold">Upcoming distributions</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">Nothing scheduled right now.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {upcoming.map((event) => (
                <li
                  key={event.id}
                  className="flex gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0"
                >
                  <span className="w-20 shrink-0 text-text-muted">
                    {new Date(event.startAt).toLocaleDateString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="font-medium">{event.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Inventory overview</h2>
            {lowStock === null ? null : (
              <span className="rounded-full bg-warning-pill-bg px-2 py-0.5 text-xs font-semibold text-warning-text">
                {lowStock} low
              </span>
            )}
          </div>
          {inventory.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">No stock rows yet.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {inventory.map((row) => (
                <li key={row.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">
                    {row.itemTypeName}
                    {row.lowStock ? (
                      <span className="ml-2 text-xs text-warning-text">Low</span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-2 w-20 overflow-hidden rounded-full bg-surface-alt"
                  >
                    <span
                      className={`block h-full rounded-full ${
                        row.lowStock ? 'bg-accent' : 'bg-primary-subtle'
                      }`}
                      style={{ width: `${Math.round((row.available / stockMax) * 100)}%` }}
                    />
                  </span>
                  <span className="w-12 text-right font-semibold">{row.available}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-pine" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Recent activity</h2>
          </div>
          {recentAudit.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">No recorded activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {recentAudit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex gap-4 border-b border-border pb-3 last:border-b-0"
                >
                  <span className="w-20 shrink-0 text-text-muted">
                    {new Date(entry.createdAt).toLocaleTimeString('en-PH', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{entry.action}</span>
                    {entry.actorName === null ? null : (
                      <span className="block text-xs text-text-muted">by {entry.actorName}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
