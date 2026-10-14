import { Link } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { donorDashboardResponseSchema } from '@agapay/shared';
import { getUser, subscribe } from '../../lib/session';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Reveal } from '../../components/ui/reveal';

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function DonorDashboardPage() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const firstName = (user?.name ?? 'Friend').split(' ')[0] ?? 'Friend';
  const query = useApiQuery(
    ['donor-dashboard'],
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
        {(dashboard) => (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="relative overflow-hidden rounded-lg lg:col-span-2">
                <img
                  src="/images/relief-distribution.png"
                  alt="Relief volunteers distributing meals and supplies"
                  className="h-56 w-full object-cover"
                />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-text/70 to-transparent p-5">
                  <p className="text-sm text-white/90">
                    {greetingFor(new Date().getHours())}, {firstName}!
                  </p>
                  <p className="font-display text-2xl font-semibold text-white">
                    Your support brings hope.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
                <h2 className="font-display text-lg font-semibold">Make a Donation</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Give relief goods to ongoing campaigns.
                </p>
                <Link
                  to="/donor/campaign"
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
                >
                  Browse campaigns
                </Link>
              </div>
            </div>

            <Reveal className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
                <p className="text-sm text-text-muted">Total Donations</p>
                <p className="mt-1 text-3xl font-bold">{dashboard.totalDonations}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
                <p className="text-sm text-text-muted">Total Items Donated</p>
                <p className="mt-1 text-3xl font-bold">
                  {dashboard.totalItemsReceived.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-text-muted">Received goods, all time</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
                <p className="text-sm text-text-muted">Campaigns Supported</p>
                <p className="mt-1 text-3xl font-bold">{dashboard.campaignsSupported}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {dashboard.activeCampaigns} active relief{' '}
                  {dashboard.activeCampaigns === 1 ? 'effort' : 'efforts'}
                </p>
              </div>
            </Reveal>

            <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <PageHeader title="Donation Activity" />
              {dashboard.recent.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">
                  No donations yet. Your recent donations will appear here.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {dashboard.recent.map((row) => (
                    <li key={row.id} className="flex justify-between gap-2">
                      <span className="text-text-muted">{formatDate(row.submittedAt)}</span>
                      <span className="font-medium">{row.campaignName}</span>
                      <span className="text-text-muted">{row.referenceNumber}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </AsyncBoundary>

      <div className="fixed bottom-6 right-6">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="The assistant arrives in a later release"
          aria-label="Agapay AI assistant, coming soon"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary-subtle px-5 py-3 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-80"
        >
          AGAPAY AI
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">Soon</span>
        </button>
      </div>
    </div>
  );
}
