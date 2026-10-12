import { Link, useParams } from 'react-router-dom';
import { publicCampaignResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function PublicCampaignDetailPage() {
  const { slug } = useParams();
  const query = useApiQuery(
    ['public-campaign', slug],
    `/api/v1/public/campaigns/${encodeURIComponent(slug ?? '')}`,
    publicCampaignResponseSchema,
    { enabled: slug !== undefined && slug.length > 0 },
  );

  return (
    <div className="space-y-6">
      <AsyncBoundary
        data={query.data?.data ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading campaign…"
        emptyTitle="Campaign not found"
        emptyDescription="This campaign does not exist or is no longer active."
      >
        {(campaign) => (
          <div className="space-y-6">
            <PageHeader title={campaign.name} description={campaign.description} />
            <p className="text-sm text-text-muted">
              Runs {formatDate(campaign.startDate)} to{' '}
              {campaign.endDate === null ? 'ongoing' : formatDate(campaign.endDate)}
            </p>

            <section
              aria-labelledby="areas-heading"
              className="rounded-lg border border-border bg-surface p-5 shadow-card"
            >
              <h2 id="areas-heading" className="text-base font-semibold">
                Covered areas
              </h2>
              {campaign.areas.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">Open to all areas.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {campaign.areas.map((area, index) => (
                    <li key={`${area.barangay}-${area.city}-${index}`}>
                      {area.barangay}, {area.city}, {area.province}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="needs-heading"
              className="rounded-lg border border-border bg-surface p-5 shadow-card"
            >
              <h2 id="needs-heading" className="text-base font-semibold">
                Priority needs
              </h2>
              {campaign.priorityItems.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">
                  General relief goods. Tell us what you need in the request form.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {campaign.priorityItems.map((item) => (
                    <li key={item.itemTypeId}>
                      {item.itemName} ({item.unit}
                      {item.targetQuantity === null ? '' : `, target ${item.targetQuantity}`})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Link
              to={`/request-assistance?campaign=${campaign.id}`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Request assistance from this campaign
            </Link>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
