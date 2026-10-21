import { auditListResponseSchema, type AuditLogDto } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useState } from 'react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/Button';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Read-only by construction: no row actions, because an audit entry is never
// edited or deleted (rules-backend.md DB-06).
export function AuditLogPage() {
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    actorId: '',
    entityId: '',
    from: '',
    to: '',
  });
  const [cursors, setCursors] = useState<string[]>([]);
  const params = new URLSearchParams({ limit: '25' });
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim())
      params.set(
        key,
        key === 'from'
          ? `${value}T00:00:00+08:00`
          : key === 'to'
            ? `${value}T23:59:59.999+08:00`
            : value.trim(),
      );
  }
  const cursor = cursors.at(-1);
  if (cursor) params.set('cursor', cursor);
  const query = useApiQuery(
    ['auditLogs', params.toString()],
    `/api/v1/audit-logs?${params}`,
    auditListResponseSchema,
  );

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
      <div className="flex flex-wrap gap-3">
        {(['action', 'entityType', 'actorId', 'entityId', 'from', 'to'] as const).map((key) => (
          <label key={key} className="block">
            {
              {
                action: 'Action',
                entityType: 'Record type',
                actorId: 'Actor ID',
                entityId: 'Record ID',
                from: 'From date',
                to: 'To date',
              }[key]
            }
            <Input
              type={key === 'from' || key === 'to' ? 'date' : 'text'}
              value={filters[key]}
              onChange={(e) => {
                setFilters({ ...filters, [key]: e.target.value });
                setCursors([]);
              }}
            />
          </label>
        ))}
      </div>

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
      <nav aria-label="Audit pages" className="flex items-center gap-3">
        <Button
          variant="accent"
          disabled={cursors.length === 0 || query.isPending}
          onClick={() => setCursors(cursors.slice(0, -1))}
        >
          Previous
        </Button>
        <span>Page {cursors.length + 1}</span>
        <Button
          variant="accent"
          disabled={!query.data?.data.nextCursor || query.isPending}
          onClick={() => {
            const next = query.data?.data.nextCursor;
            if (next) setCursors([...cursors, next]);
          }}
        >
          Next
        </Button>
      </nav>
    </div>
  );
}
