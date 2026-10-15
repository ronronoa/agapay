import { Link } from 'react-router-dom';
import { publicCampaignListResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { AsyncBoundary } from '../ui/AsyncBoundary';
import { Reveal } from '../ui/reveal';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function AffectedAreasSection() {
  const query = useApiQuery(
    ['public-campaigns', 'landing'],
    '/api/v1/public/campaigns?pageSize=6',
    publicCampaignListResponseSchema,
  );

  return (
    <section id="impact" aria-labelledby="areas-heading" className="w-full bg-bg py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2
            id="areas-heading"
            className="font-display text-2xl font-semibold tracking-tight text-text sm:text-3xl"
          >
            Affected areas of the Philippines
          </h2>
          <p className="mt-4 text-base leading-relaxed text-text-muted sm:text-lg">
            These relief drives are currently active and accepting requests across their barangays.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex justify-center">
            <div className="w-full max-w-md overflow-hidden rounded-b-[40px] rounded-t-[180px] shadow-xl sm:max-w-lg sm:rounded-t-[240px]">
              <img
                src="/images/relief-distribution.png"
                alt="Relief volunteers distributing meals and supplies to affected communities"
                className="h-full w-full object-cover object-center"
                loading="lazy"
              />
            </div>
          </div>

          <AsyncBoundary
            data={query.data?.data.items ?? null}
            error={query.error}
            isPending={query.isPending}
            onRetry={query.refetch}
            loadingLabel="Loading relief drives…"
            isEmpty={(items) => items.length === 0}
            emptyTitle="No active drives right now"
            emptyDescription="There are no relief drives accepting requests at the moment. Please check back later."
          >
            {(items) => (
              <Reveal className="flex flex-col gap-4">
                {items.map((campaign) => (
                  <article
                    key={campaign.id}
                    className="rounded-xl border border-border bg-surface px-6 py-5 shadow-card"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
                      />
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-semibold text-text">
                          {campaign.name}
                        </h3>
                        <p className="mt-1 text-sm text-text-muted">
                          {formatDate(campaign.startDate)} to{' '}
                          {campaign.endDate === null ? 'ongoing' : formatDate(campaign.endDate)} ·{' '}
                          {campaign.areas.length === 0
                            ? 'Open to all areas'
                            : campaign.areas
                                .map((area) => `${area.barangay}, ${area.city}`)
                                .join(' · ')}
                        </p>
                        <Link
                          to={`/campaigns/${campaign.slug}`}
                          className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4"
                        >
                          View this drive
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </Reveal>
            )}
          </AsyncBoundary>
        </div>
      </div>
    </section>
  );
}
