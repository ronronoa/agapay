import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { publicCampaignListResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Button, buttonVariants } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { CampaignCover } from '../../components/ui/CampaignCover';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../components/ui/card';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  });
}

export function PublicCampaignsPage({ audience = 'public' }: { audience?: 'public' | 'donor' }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '12' });
  if (q.trim()) params.set('q', q.trim());
  const query = useApiQuery(
    ['public-campaigns', params.toString()],
    `/api/v1/public/campaigns?${params}`,
    publicCampaignListResponseSchema,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={audience === 'donor' ? 'Campaigns' : 'Relief campaigns'}
        description={
          audience === 'donor'
            ? 'Explore active relief drives and the goods you can donate.'
            : 'Explore active relief drives, covered communities, and priority goods.'
        }
      />

      <div className="flex flex-col gap-2 sm:max-w-md">
        <Label htmlFor="public-campaign-search">Search campaigns</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            id="public-campaign-search"
            type="search"
            maxLength={200}
            value={q}
            className="pl-9"
            placeholder="Search campaigns…"
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      <AsyncBoundary
        data={query.data?.data.items ?? null}
        error={query.error}
        isPending={query.isPending}
        isRefreshing={query.isFetching && !query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading campaigns…"
        isEmpty={(items) => items.length === 0}
        emptyTitle={q.trim() ? 'No matching campaigns' : 'No active campaigns right now'}
        emptyDescription={
          q.trim()
            ? 'Try another campaign name.'
            : 'There are no relief drives accepting requests at the moment. Please check back later.'
        }
      >
        {(items) => (
          <div
            aria-label="Relief campaigns"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {items.map((campaign) => (
              <Card key={campaign.id}>
                <CampaignCover key={campaign.coverImageUrl} src={campaign.coverImageUrl} />
                <CardHeader>
                  <StatusBadge label="Active" />
                  <CardTitle className="break-words">{campaign.name}</CardTitle>
                  <CardDescription className="line-clamp-3 break-words">
                    {campaign.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm capitalize text-text-muted">
                    {campaign.calamityType.toLowerCase().replaceAll('_', ' ')}
                  </p>
                  <p className="mt-2 text-sm">
                    {campaign.areas.length
                      ? `${campaign.areas.length} covered areas`
                      : 'Open to all areas'}
                  </p>
                  {campaign.priorityItems.length > 0 ? (
                    <p className="mt-1 text-sm text-text-muted">
                      Needs: {campaign.priorityItems.map((item) => item.itemName).join(', ')}
                    </p>
                  ) : null}
                </CardContent>
                <CardFooter>
                  <Link
                    className={buttonVariants({ variant: 'outline' })}
                    to={`/campaigns/${campaign.slug}`}
                  >
                    View details
                  </Link>
                  <Link
                    className={buttonVariants()}
                    to={`/${audience === 'donor' ? 'donate' : 'request-assistance'}?campaign=${campaign.id}`}
                  >
                    {audience === 'donor' ? 'Donate goods' : 'Request assistance'}
                  </Link>
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-text-muted">Start date</dt>
                      <dd className="mt-1">{formatDate(campaign.startDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">End date</dt>
                      <dd className="mt-1">
                        {campaign.endDate ? formatDate(campaign.endDate) : 'Open-ended'}
                      </dd>
                    </div>
                  </dl>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </AsyncBoundary>
      <nav aria-label="Campaign pages" className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
        <p className="text-sm text-text-muted">
          Page {page} · {query.data?.data.total ?? 0} campaigns
        </p>
        <Button
          variant="outline"
          disabled={query.isFetching || page * 12 >= (query.data?.data.total ?? 0)}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </nav>
    </div>
  );
}
