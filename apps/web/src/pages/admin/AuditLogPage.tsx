import { auditListResponseSchema, type AuditLogDto } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

// Read-only by construction: no row actions, because an audit entry is never
// edited or deleted (rules-backend.md DB-06).
export function AuditLogPage() {
  const query = useApiQuery(['auditLogs'], '/api/v1/audit-logs?limit=50', auditListResponseSchema);

  const entries: AuditLogDto[] = query.data?.data.items ?? [];

  const columns: Column<AuditLogDto>[] = [
    { key: 'when', header: 'When', render: (row) => formatDateTime(row.createdAt) },
    { key: 'actor', header: 'Actor', render: (row) => row.actorName ?? 'System' },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <code className="text-xs">{row.action}</code>,
    },
    { key: 'entity', header: 'Record', render: (row) => row.entityType },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Every administrative change, recorded in the same transaction as the change itself."
      />

      <AsyncBoundary
        data={query.isPending || query.error !== null ? null : entries}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading audit entries…"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="No audit entries yet"
        emptyDescription="Administrative changes will appear here as staff use the system."
      >
        {(rows) => (
          <DataTable
            caption="Administrative audit trail"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}
