import { Link } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { ArrowRight, Flag, Heart, Package } from 'lucide-react';
import { donorDashboardResponseSchema } from '@agapay/shared';
import { getUser, subscribe } from '../../lib/session';
import { useApiQuery } from '../../lib/use-api-query';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Reveal } from '../../components/ui/reveal';
import { StatusBadge } from '../../components/ui/StatusBadge';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  SCHEDULED: 'Scheduled',
  COLLECTED: 'Collected',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
  });
}

function daysLeft(endDate: string | null): number | null {
  if (endDate === null) return null;
  const ms = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function StatCard({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Heart;
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-alt text-pine"
        >
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm text-text-muted">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold">{value.toLocaleString('en-PH')}</p>
      <p className="mt-2 text-xs text-text-muted">{caption}</p>
    </div>
  );
}

export function DonorDashboardPage() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const firstName = (user?.name ?? 'Friend').split(' ')[0] ?? 'Friend';
  const query = useApiQuery(
    ['donor-dashboard', user?.id],
    '/api/v1/dashboard/donor',
    donorDashboardResponseSchema,
  );

  return (
    <div className="space-y-6">
      <AsyncBoundary
        data={query.data?.data ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading your dashboard…"
        isEmpty={() => false}
        emptyTitle=""
        emptyDescription=""
      >
        {(dashboard) => {
          const featured = dashboard.featuredCampaign;
          const remaining = daysLeft(featured?.endDate ?? null);
          const goal = featured?.goalUnits ?? null;
          const percent =
            featured === null || goal === null || goal === 0
              ? null
              : Math.min(100, Math.round((featured.raisedUnits / goal) * 100));

          return (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="relative overflow-hidden rounded-xl lg:col-span-2">
                  <img
                    src="/images/relief-distribution.png"
                    alt="Relief volunteers distributing meals and supplies"
                    className="h-64 w-full object-cover"
                  />
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-text/80 to-transparent p-6">
                    <p className="text-sm text-white/90">
                      {greetingFor(
                        Number(
                          new Intl.DateTimeFormat('en-PH', {
                            timeZone: 'Asia/Manila',
                            hour: 'numeric',
                            hourCycle: 'h23',
                          }).format(new Date()),
                        ),
                      )}
                      , {firstName}!
                    </p>
                    <p className="font-display text-2xl font-semibold text-white">
                      Your support brings hope.
                    </p>
                    <p className="mt-1 max-w-lg text-sm text-white/85">
                      Thank you for helping communities recover together. We can make a difference.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface-alt p-6">
                  <h2 className="font-display text-lg font-semibold text-primary">
                    Make a Donation
                  </h2>
                  <p className="mt-2 text-sm text-text-muted">
                    Give relief goods to ongoing campaigns.
                  </p>
                  <Link
                    to="/donor/campaign"
                    className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-primary-subtle px-6 py-2.5 text-sm font-semibold text-surface hover:bg-pine-dark"
                  >
                    Donate Now
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <Reveal className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  icon={Heart}
                  label="Total donations"
                  value={dashboard.totalDonations}
                  caption={`+${dashboard.donationsThisMonth} this month`}
                />
                <StatCard
                  icon={Package}
                  label="Total items donated"
                  value={dashboard.totalItemsReceived}
                  caption="Received goods, all time"
                />
                <StatCard
                  icon={Flag}
                  label="Campaigns supported"
                  value={dashboard.campaignsSupported}
                  caption={`${dashboard.activeCampaigns} active relief ${
                    dashboard.activeCampaigns === 1 ? 'effort' : 'efforts'
                  }`}
                />
              </Reveal>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">Donation activity</h2>
                    <Link
                      to="/donor/activity"
                      className="text-sm font-medium text-primary underline underline-offset-4"
                    >
                      View all
                    </Link>
                  </div>
                  {dashboard.recent.length === 0 ? (
                    <p className="mt-3 text-sm text-text-muted">
                      No donations yet. Your recent donations will appear here.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-3 text-sm">
                      {dashboard.recent.map((row) => (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
                        >
                          <span className="w-24 shrink-0 text-text-muted">
                            {formatDate(row.submittedAt)}
                          </span>
                          <span className="min-w-0 flex-1 font-medium">{row.campaignName}</span>
                          <StatusBadge
                            label={STATUS_LABEL[row.status] ?? row.status}
                            muted={row.status === 'REJECTED' || row.status === 'CANCELLED'}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
                  <h2 className="text-sm font-semibold">Featured campaign</h2>
                  {featured === null ? (
                    <p className="mt-3 text-sm text-text-muted">
                      No campaign is open right now. Check back soon.
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 font-display text-lg font-semibold">{featured.name}</p>
                      {percent === null ? (
                        <p className="mt-2 text-sm text-text-muted">
                          No goal set for this campaign yet.
                        </p>
                      ) : (
                        <>
                          <span
                            aria-hidden="true"
                            className="mt-3 block h-2 w-full overflow-hidden rounded-full bg-surface-alt"
                          >
                            <span
                              className="block h-full rounded-full bg-primary-subtle"
                              style={{ width: `${percent}%` }}
                            />
                          </span>
                          <p className="mt-2 text-sm text-text-muted">
                            {percent}% of goal reached
                            {remaining === null ? '' : ` · ${remaining} days left`}
                          </p>
                        </>
                      )}
                      {percent === null && remaining !== null ? (
                        <p className="mt-1 text-sm text-text-muted">{remaining} days left</p>
                      ) : null}
                      <Link
                        to={`/donate?campaign=${featured.id}`}
                        className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary-subtle px-5 py-2.5 text-sm font-semibold text-surface hover:bg-pine-dark"
                      >
                        Support this campaign
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
