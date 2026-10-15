import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { publicStatsResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { AsyncBoundary } from '../ui/AsyncBoundary';

const STATS = [
  { key: 'beneficiariesServed', label: 'Beneficiaries served' },
  { key: 'goodsDistributedThisMonth', label: 'Goods distributed / month' },
  { key: 'verifiedDonations', label: 'Verified donations' },
] as const;

export function LandingHero() {
  const statsQuery = useApiQuery(
    ['public-stats'],
    '/api/v1/public/stats',
    publicStatsResponseSchema,
  );

  return (
    <section aria-labelledby="hero-heading" className="w-full bg-bg py-12 sm:py-16 lg:py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
        <div className="space-y-6 lg:col-span-7 lg:pr-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text">
            <Heart className="h-4 w-4 text-primary" aria-hidden="true" />
            Kapit-bisig, together
          </p>
          <h1
            id="hero-heading"
            className="font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl lg:text-6xl"
          >
            Connecting donors with communities hit by calamity
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl">
            Agapay manages the full relief process: from collecting donated goods, through inventory
            and scheduling, to getting supplies into the hands of families who need them.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to="/request-assistance"
              className="inline-flex min-h-12 items-center justify-center rounded-xs bg-pine px-7 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-pine-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              Request Aid Now
            </Link>
            <Link
              to="/campaigns"
              className="inline-flex min-h-12 items-center justify-center rounded-xs border-2 border-pine bg-transparent px-7 py-3 text-base font-semibold text-pine transition hover:bg-pine/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              Donate Goods
            </Link>
          </div>

          <AsyncBoundary
            data={statsQuery.data?.data ?? null}
            error={statsQuery.error}
            isPending={statsQuery.isPending}
            onRetry={statsQuery.refetch}
            loadingLabel="Loading Agapay's impact…"
            isEmpty={() => false}
            emptyTitle=""
            emptyDescription=""
          >
            {(stats) => (
              <div className="grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-3">
                {STATS.map((stat) => (
                  <div key={stat.key}>
                    <p className="font-display text-2xl font-bold text-text">
                      {stats[stat.key].toLocaleString('en-PH')}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}
          </AsyncBoundary>
        </div>

        <div className="flex justify-center lg:col-span-5 lg:justify-end">
          <div className="relative w-full max-w-md overflow-hidden rounded-t-lg rounded-br-lg rounded-bl-[180px]">
            <img
              src="/images/hero-child(2).png"
              alt="hero-landing-image"
              className="h-full w-full object-fill object-center aspect-square"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
