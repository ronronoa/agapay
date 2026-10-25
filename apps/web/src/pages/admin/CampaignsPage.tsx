import { toast } from 'sonner';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  campaignListResponseSchema,
  campaignResponseSchema,
  CAMPAIGN_TRANSITIONS,
  hasRole,
  type CampaignDto,
} from '@agapay/shared';
import {
  Archive,
  CheckCircle2,
  ImageOff,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useApiQuery } from '../../lib/use-api-query';
import { getUser, subscribe } from '../../lib/session';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import { Label } from '../../components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CreateCampaignDialog } from './CreateCampaignDialog';
import { ApiClientError, apiFetch } from '../../lib/api-client';
import { imageUrl } from '../../lib/image-url';

type Action = 'activate' | 'complete' | 'archive' | 'delete';
const ACTIONS = {
  activate: {
    label: 'Activate',
    target: 'ACTIVE',
    icon: Play,
    description: 'This campaign will accept donations and assistance requests.',
  },
  complete: {
    label: 'Complete',
    target: 'COMPLETED',
    icon: CheckCircle2,
    description:
      'This stops new donations and requests. History and remaining stock stay available.',
  },
  archive: {
    label: 'Archive',
    target: 'ARCHIVED',
    icon: Archive,
    description:
      'This preserves campaign history and remaining stock. An archived campaign cannot be reopened.',
  },
  delete: {
    label: 'Delete',
    target: '',
    icon: Trash2,
    description: 'This permanently removes this unused draft and its cover image.',
  },
} as const;
const ACTION_ORDER: readonly Action[] = ['activate', 'complete', 'archive', 'delete'];
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};
const BLOCKER_LABEL: Record<string, string> = {
  donations: 'unfinished donations',
  requests: 'unresolved requests',
  events: 'scheduled events',
  allocations: 'scheduled allocations',
  reservedGoods: 'reserved goods',
};
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
function blockers(campaign: CampaignDto): string {
  return (campaign.closureBlockers ?? [])
    .map((row) => `${row.count} ${BLOCKER_LABEL[row.blocking]}`)
    .join(', ');
}
function allowed(campaign: CampaignDto, action: Action): boolean {
  if (campaign.isSystem) return false;
  if (action === 'delete') return campaign.status === 'DRAFT' && campaign.deletable;
  const targets: readonly string[] =
    Object.entries(CAMPAIGN_TRANSITIONS).find(([status]) => status === campaign.status)?.[1] ?? [];
  return targets.includes(ACTIONS[action].target);
}
function Cover({ campaign }: { campaign: CampaignDto }) {
  const [failed, setFailed] = useState(false);
  return campaign.coverImageUrl && !failed ? (
    <img
      src={imageUrl(campaign.coverImageUrl)}
      alt=""
      loading="lazy"
      className="aspect-video w-full object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="flex aspect-video items-center justify-center gap-2 bg-surface-alt text-sm text-text-muted">
      <ImageOff aria-hidden="true" className="size-5" />
      No campaign image
    </div>
  );
}

export function CampaignsPage() {
  const client = useQueryClient();
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const manager = hasRole(user?.role, ['ADMIN']);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '12' });
  if (q.trim()) params.set('q', q.trim());
  if (status) params.set('status', status);
  const query = useApiQuery(
    ['campaigns', params.toString()],
    `/api/v1/campaigns?${params}`,
    campaignListResponseSchema,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignDto | null>(null);
  const [viewing, setViewing] = useState<CampaignDto | null>(null);
  const [action, setAction] = useState<{ kind: Action; campaign: CampaignDto } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['campaigns'] });
  }
  async function prepare(campaign: CampaignDto, intent: Action | 'edit' | 'view') {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const current = campaignResponseSchema.parse(
        await apiFetch(`/api/v1/campaigns/${campaign.id}`),
      ).data;
      if (intent === 'view') setViewing(current);
      else if (intent === 'edit') setEditing(current);
      else setAction({ kind: intent, campaign: current });
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Could not load campaign. Please retry.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function perform() {
    if (!action || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/v1/campaigns/${action.campaign.id}${action.kind === 'delete' ? '' : `/${action.kind}`}`,
        {
          method: action.kind === 'delete' ? 'DELETE' : 'POST',
          body: action.campaign.updatedAt ? { expectedUpdatedAt: action.campaign.updatedAt } : {},
        },
      );
      if (action.kind !== 'delete') campaignResponseSchema.parse(response);
      toast.success(
        `Campaign ${action.kind === 'delete' ? 'deleted' : action.kind === 'activate' ? 'activated' : action.kind === 'complete' ? 'completed' : 'archived'}.`,
      );
      setAction(null);
      setViewing(null);
      if (action.kind === 'delete') setPage(1);
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : 'Campaign action failed. Please retry.',
      );
      if (err instanceof ApiClientError && err.status === 409) {
        const latest = campaignResponseSchema.safeParse(
          await apiFetch(`/api/v1/campaigns/${action.campaign.id}`).catch(() => null),
        );
        setAction(latest.success ? { ...action, campaign: latest.data.data } : null);
        await refresh();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const closingBlocked =
    action !== null &&
    (action.kind === 'complete' || action.kind === 'archive') &&
    (action.campaign.closureBlockers?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Campaigns"
        description="Manage relief campaigns, covered communities, and priority goods."
        actions={
          manager ? (
            <Button disabled={busy} onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              Add Campaign
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="campaign-search">Search campaigns</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              id="campaign-search"
              className="pl-10"
              placeholder="Search by campaign name"
              maxLength={120}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Label htmlFor="campaign-status">Status</Label>
          <NativeSelect
            id="campaign-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
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
        emptyTitle={q || status ? 'No matching campaigns' : 'No campaigns yet'}
        emptyDescription={
          q || status
            ? 'Try another search or status.'
            : 'Add a campaign to start accepting donations and assistance requests.'
        }
        emptyAction={
          manager && !q && !status ? (
            <Button onClick={() => setCreateOpen(true)}>Add Campaign</Button>
          ) : undefined
        }
      >
        {(items) => (
          <div
            aria-label="Relief campaigns"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {items.map((campaign) => (
              <Card key={campaign.id}>
                <Cover key={campaign.coverImageUrl} campaign={campaign} />
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge
                      label={STATUS_LABEL[campaign.status] ?? campaign.status}
                      muted={campaign.status === 'COMPLETED' || campaign.status === 'ARCHIVED'}
                    />
                    {manager && !campaign.isSystem && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            aria-label={`Actions for ${campaign.name}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => void prepare(campaign, 'edit')}>
                              <Pencil aria-hidden="true" />
                              Edit
                            </DropdownMenuItem>
                            {ACTION_ORDER.filter((kind) => allowed(campaign, kind)).map((kind) => {
                              const Icon = ACTIONS[kind].icon;
                              return (
                                <DropdownMenuItem
                                  key={kind}
                                  onSelect={() => void prepare(campaign, kind)}
                                >
                                  <Icon aria-hidden="true" />
                                  {ACTIONS[kind].label}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <CardTitle className="break-words">{campaign.name}</CardTitle>
                  <CardDescription className="line-clamp-3 break-words">
                    {campaign.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm capitalize text-text-muted">
                    {campaign.calamityType.toLowerCase().replaceAll('_', ' ')}
                    {campaign.isSystem ? ' · System campaign' : ''}
                  </p>
                  <p className="mt-2 text-sm">
                    {campaign.areas.length} areas · {campaign.requestCount} requests ·{' '}
                    {campaign.donationCount} donations
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void prepare(campaign, 'view')}
                  >
                    {manager && !campaign.isSystem ? 'Manage campaign' : 'View campaign'}
                  </Button>
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
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <p className="text-sm text-text-muted">
          Page {page} · {query.data?.data.total ?? 0} campaigns
        </p>
        <Button
          variant="outline"
          disabled={query.isFetching || page * 12 >= (query.data?.data.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </nav>
      {manager && createOpen && (
        <CreateCampaignDialog
          open
          onClose={() => setCreateOpen(false)}
          onCreated={() => void refresh()}
        />
      )}
      {manager && editing && (
        <CreateCampaignDialog
          key={editing.id}
          open
          campaign={editing}
          onClose={() => setEditing(null)}
          onCreated={() => void refresh()}
        />
      )}
      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setViewing(null);
        }}
      >
        <DialogTitle>{viewing?.name ?? 'Campaign details'}</DialogTitle>
        <DialogDescription>
          Campaign details, history counts, and outstanding work.
        </DialogDescription>
        {viewing && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="whitespace-pre-wrap break-words text-sm">{viewing.description}</p>
            <p className="text-sm">
              {viewing.donationCount} donations · {viewing.requestCount} requests ·{' '}
              {viewing.eventCount} events · {viewing.inventoryCount} stock records
            </p>
            <p className="text-sm">
              {blockers(viewing)
                ? `Resolve before closing: ${blockers(viewing)}.`
                : 'No outstanding work blocks campaign closure.'}
            </p>
            <p className="text-sm">
              {viewing.priorityItems
                .map(
                  (item) =>
                    `${item.itemName}${item.targetQuantity ? ` (${item.targetQuantity} ${item.unit})` : ''}`,
                )
                .join(', ') || 'No priority goods set.'}
            </p>
            <ul className="text-sm">
              {viewing.areas.map((area) => (
                <li key={area.id}>
                  {area.barangay}, {area.city}, {area.province}
                </li>
              ))}
            </ul>
            <DialogFooter className="flex-wrap">
              {manager &&
                ACTION_ORDER.filter((kind) => allowed(viewing, kind)).map((kind) => (
                  <Button
                    key={kind}
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setAction({ kind, campaign: viewing });
                      setViewing(null);
                    }}
                  >
                    {ACTIONS[kind].label}
                  </Button>
                ))}
              <Button variant="outline" disabled={busy} onClick={() => setViewing(null)}>
                Close
              </Button>
              {manager && !viewing.isSystem && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(viewing);
                    setViewing(null);
                  }}
                >
                  Edit campaign
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={action !== null}
        title={action ? `${ACTIONS[action.kind].label} this campaign?` : 'Campaign action'}
        description={
          action
            ? `${action.campaign.name}. ${ACTIONS[action.kind].description} ${action.kind === 'complete' || action.kind === 'archive' ? (blockers(action.campaign) ? `Resolve first: ${blockers(action.campaign)}.` : 'No outstanding work blocks closure.') : ''}`
            : ''
        }
        confirmLabel={action ? `Yes, ${action.kind}` : 'Confirm'}
        confirmDisabled={
          closingBlocked || (action !== null && !allowed(action.campaign, action.kind))
        }
        pending={busy}
        onCancel={() => setAction(null)}
        onConfirm={() => void perform()}
      />
    </div>
  );
}
