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
    <section id="impact" aria-labelledby="areas-heading" className="w-full bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
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
                    className="rounded-xl border border-border bg-white px-6 py-5 shadow-sm"
                  >
                    <h3 className="font-display text-base font-semibold text-text">
                      {campaign.name}
                    </h3>
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="text-sm text-text-muted">
                        {formatDate(campaign.startDate)} to{' '}
                        {campaign.endDate === null ? 'ongoing' : formatDate(campaign.endDate)}
                      </p>
                      <p className="text-sm text-text-muted">
                        {campaign.areas.length === 0
                          ? 'Open to all areas'
                          : campaign.areas
                              .map((area) => `${area.barangay}, ${area.city}`)
                              .join(' · ')}
                      </p>
                    </div>
                    <Link
                      to={`/campaigns/${campaign.slug}`}
                      className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4"
                    >
                      View this drive
                    </Link>
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
