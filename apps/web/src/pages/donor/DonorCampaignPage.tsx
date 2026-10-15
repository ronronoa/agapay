import { Link } from 'react-router-dom';
import { campaignListResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Reveal } from '../../components/ui/reveal';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function DonorCampaignPage() {
  const query = useApiQuery(
    ['donor-campaigns'],
    '/api/v1/campaigns?pageSize=100',
    campaignListResponseSchema,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Active relief drives you can support with a donation."
      />

      <AsyncBoundary
        data={query.data?.data.items ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading campaigns…"
        isEmpty={(items) => items.length === 0}
        emptyTitle="No active campaigns right now"
        emptyDescription="There are no relief drives accepting donations at the moment. Please check back later."
      >
        {(items) => (
          <Reveal className="grid gap-4 md:grid-cols-2">
            {items.map((campaign) => (
              <article
                key={campaign.id}
                className="flex flex-col rounded-lg border border-border bg-surface p-5 shadow-card"
              >
                <h2 className="font-display text-lg font-semibold">{campaign.name}</h2>
                <p className="mt-1 line-clamp-3 text-sm text-text-muted">{campaign.description}</p>
                <p className="mt-3 text-sm">
                  <span className="text-text-muted">Runs </span>
                  {formatDate(campaign.startDate)}
                  <span className="text-text-muted"> to </span>
                  {campaign.endDate === null ? 'ongoing' : formatDate(campaign.endDate)}
                </p>
                <div className="mt-4 flex gap-3">
                  <Link
                    to={`/campaigns/${campaign.slug}`}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
                  >
                    View details
                  </Link>
                  <Link
                    to={`/donate?campaign=${campaign.id}`}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
                  >
                    Join Campaign
                  </Link>
                </div>
              </article>
            ))}
          </Reveal>
        )}
      </AsyncBoundary>
    </div>
  );
}
