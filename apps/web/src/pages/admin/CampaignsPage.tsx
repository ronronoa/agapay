import { useState } from 'react';
import { CampaignStatus, campaignListResponseSchema, type CampaignDto } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CreateCampaignDialog } from './CreateCampaignDialog';
import { ApiClientError, apiFetch } from '../../lib/api-client';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function CampaignsPage() {
  const query = useApiQuery(
    ['campaigns'],
    '/api/v1/campaigns?pageSize=100',
    campaignListResponseSchema,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activating, setActivating] = useState<CampaignDto | null>(null);

  function activate(campaign: CampaignDto): void {
    setActionError(null);
    void apiFetch(`/api/v1/campaigns/${encodeURIComponent(campaign.id)}/activate`, {
      method: 'POST',
    })
      .then(() => {
        setMessage(`Campaign "${campaign.name}" is now active.`);
        setActivating(null);
        query.refetch();
      })
      .catch((err: unknown) => {
        setActivating(null);
        setActionError(
          err instanceof ApiClientError ? err.message : 'Activation failed. Please try again.',
        );
      });
  }

  const columns: Column<CampaignDto>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'calamity',
      header: 'Calamity',
      render: (row) => (
        <span className="capitalize">{row.calamityType.toLowerCase().replace('_', ' ')}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      // Label plus text, never colour alone (design.md section 13).
      render: (row) => (
        <StatusBadge
          label={STATUS_LABEL[row.status] ?? row.status}
          muted={row.status === CampaignStatus.ARCHIVED || row.status === CampaignStatus.COMPLETED}
        />
      ),
    },
    { key: 'start', header: 'Starts', render: (row) => formatDate(row.startDate) },
    {
      key: 'end',
      header: 'Ends',
      render: (row) => (row.endDate === null ? 'Open' : formatDate(row.endDate)),
    },
    {
      key: 'areas',
      header: 'Areas',
      render: (row) => (row.areas.length === 0 ? '—' : String(row.areas.length)),
    },
    {
      key: 'priority',
      header: 'Priority goods',
      render: (row) => (row.priorityItems.length === 0 ? '—' : String(row.priorityItems.length)),
    },
    { key: 'requests', header: 'Requests', render: (row) => String(row.requestCount) },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) =>
        row.status === CampaignStatus.DRAFT && !row.isSystem ? (
          <button
            type="button"
            onClick={() => setActivating(row)}
            className="font-medium text-primary underline underline-offset-4"
          >
            Activate
          </button>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Relief campaigns and their covered areas and priority goods."
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Add Campaign
          </Button>
        }
      />

      {message === null ? null : (
        <p role="status" className="text-sm font-medium">
          {message}
        </p>
      )}

      {actionError === null ? null : (
        <p role="alert" className="text-sm font-medium">
          {actionError}
        </p>
      )}

      <AsyncBoundary
        data={query.data?.data.items ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading campaigns…"
        isEmpty={(items) => items.length === 0}
        emptyTitle="No campaigns yet"
        emptyDescription="Add a campaign to start accepting donations and assistance requests."
        emptyAction={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Add Campaign
          </Button>
        }
      >
        {(items) => (
          <DataTable
            caption="Relief campaigns"
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
          />
        )}
      </AsyncBoundary>

      <CreateCampaignDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setMessage(created);
          query.refetch();
        }}
      />

      <ConfirmDialog
        open={activating !== null}
        title="Activate this campaign?"
        description={
          activating === null
            ? ''
            : `"${activating.name}" will start accepting donations and assistance requests.`
        }
        confirmLabel="Yes, activate"
        cancelLabel="Cancel"
        onCancel={() => setActivating(null)}
        onConfirm={() => {
          if (activating !== null) activate(activating);
        }}
      />
    </div>
  );
}
