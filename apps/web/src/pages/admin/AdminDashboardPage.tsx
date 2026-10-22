import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ScrollText,
  ShieldCheck,
  UserCheck,
  Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminDashboardResponseSchema, type AdminDashboardResponse } from '@agapay/shared';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { useApiQuery } from '../../lib/use-api-query';
import { Reveal } from '../../components/ui/reveal';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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
  caption,
}: {
  label: string;
  value: number | null;
  current?: number | null;
  previous?: number | null;
  caption?: string;
}): ReactNode {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-text-muted">{label}</p>
        <Delta current={current ?? null} previous={previous ?? null} />
      </div>
      <p className="mt-1 text-3xl font-bold">{value === null ? '…' : value.toLocaleString()}</p>
      {caption && <p className="mt-2 text-xs text-text-muted">{caption}</p>}
    </div>
  );
}

export function AdminDashboardPage() {
  const query = useApiQuery(
    ['admin-dashboard'],
    '/api/v1/dashboard/admin',
    adminDashboardResponseSchema,
  );
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={query.refetch}
        className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium"
      >
        Refresh dashboard
      </button>
      <AsyncBoundary
        data={query.data?.data ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading dashboard…"
        isEmpty={() => false}
        emptyTitle="Dashboard unavailable"
        emptyDescription="Retry loading dashboard."
      >
        {(dashboard) => <DashboardContents dashboard={dashboard} />}
      </AsyncBoundary>
    </div>
  );
}

function DashboardContents({ dashboard }: { dashboard: AdminDashboardResponse['data'] }) {
  const pendingDonations = dashboard.needsAttention.donationsAwaitingVerification;
  const pendingRequests = dashboard.needsAttention.requestsAwaitingReview;
  const lowStock = dashboard.needsAttention.lowStockItems;
  const distributionsToday = dashboard.needsAttention.distributionsToday;
  const thisWeekDonations = dashboard.donationActivity.thisWeek;
  const lastWeekDonations = dashboard.donationActivity.lastWeek;
  const servedTotal = dashboard.beneficiariesServed.total;
  const servedThisMonth = dashboard.beneficiariesServed.thisMonth;
  const servedLastMonth = dashboard.beneficiariesServed.lastMonth;
  const verifiedTotal = dashboard.verifiedDonations.total;
  const verifiedThisMonth = dashboard.verifiedDonations.thisMonth;
  const verifiedLastMonth = dashboard.verifiedDonations.lastMonth;
  const activeCampaigns = dashboard.activeCampaigns;
  const upcoming = dashboard.upcomingDistributions;
  const inventory = dashboard.inventory;
  const recentAudit = dashboard.recentActivity;
  const stockMax = Math.max(...inventory.map((row) => row.available), 1);
  const chartData = WEEKDAYS.map((day, index) => ({
    day,
    count: dashboard.donationActivity.byWeekday[index] ?? 0,
  }));
  const rangeStart = new Date(dashboard.periods.thisMonth.from);
  const rangeEnd = new Date(new Date(dashboard.periods.thisMonth.to).getTime() - 1);
  const rangeLabel = `${rangeStart.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Needs your attention</h2>
          <p className="text-sm text-text-muted">{rangeLabel}</p>
          <p className="text-xs text-text-muted">
            Current queues; summaries below use Manila dates. Updated{' '}
            {new Date(dashboard.asOf).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.
          </p>
        </div>
        <Link
          to="/admin/reports"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-surface-alt"
        >
          <ScrollText className="h-4 w-4" aria-hidden="true" />
          View reports
        </Link>
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
          title="Distribution events today"
          count={distributionsToday}
          actionLabel="Calendar"
          to="/admin/calendar"
        />
        <AttentionCard
          icon={Warehouse}
          title="Low stock"
          count={lowStock}
          actionLabel="View"
          to="/admin/inventory"
        />
      </Reveal>
      <p className="text-sm text-text-muted">
        {dashboard.awaitingStock} approved requests await stock.{' '}
        <Link to="/admin/requests" className="text-primary underline">
          View requests
        </Link>
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Donation activity · this week</h2>
            <Delta current={thisWeekDonations} previous={lastWeekDonations} />
          </div>
          <div className="mt-4 h-56" role="img" aria-label="Donations per weekday this week">
            {thisWeekDonations === 0 ? (
              <p className="text-sm text-text-muted">No donations this week.</p>
            ) : (
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
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Goods distributed / month</h2>
            <Delta
              current={dashboard.goodsDistributed.thisMonth}
              previous={dashboard.goodsDistributed.lastMonth}
            />
          </div>
          <p className="mt-3 text-3xl font-bold">
            {dashboard.goodsDistributed.thisMonth.toLocaleString('en-PH')}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <p className="text-sm text-text-muted">Last month</p>
              <p className="mt-1 text-xl font-semibold">
                {dashboard.goodsDistributed.lastMonth.toLocaleString('en-PH')}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Last week</p>
              <p className="mt-1 text-xl font-semibold">
                {dashboard.goodsDistributed.lastWeek.toLocaleString('en-PH')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Reveal className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Beneficiaries served"
          caption="Completed assistance requests"
          value={servedTotal}
          current={servedThisMonth}
          previous={servedLastMonth}
        />
        <StatCard label="Active campaigns" value={activeCampaigns} />
        <StatCard
          label="Verified donations"
          caption="Currently verified; trends use verification dates"
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
                      timeZone: 'Asia/Manila',
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
                    <span className="block text-xs text-text-muted">
                      {row.campaignName} · {row.unit}
                    </span>
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
                      timeZone: 'Asia/Manila',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{entry.action}</span>
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
