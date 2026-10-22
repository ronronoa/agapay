import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  campaignSchema,
  reportKindSchema,
  reportQuerySchema,
  reportResponseSchema,
  reportTables,
  reportCsv,
  type ReportKind,
  type ReportQuery,
  type ReportCell,
  type ReportTable as ReportTableData,
} from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { fetchAll } from '../../lib/fetch-all';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';

const labels: Record<ReportKind, string> = {
  donations: 'Donations',
  requests: 'Assistance requests',
  inventory: 'Inventory',
  distributions: 'Distributions',
};
const selectClass = 'w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-sm';
const filterLabelClass = 'grid w-full min-w-0 gap-1 text-sm font-medium sm:w-auto sm:max-w-xs';
function ReportTable({ table }: { table: ReportTableData }) {
  const [page, setPage] = useState(1);
  const rows = table.rows
    .slice((page - 1) * 25, page * 25)
    .map((cells, index) => ({ id: String(index), cells }));
  return (
    <section aria-label={table.title} className="space-y-3">
      <h2 className="text-base font-semibold">{table.title}</h2>
      {table.rows.length === 0 ? (
        <p className="text-sm text-text-muted">No matching groups for these filters.</p>
      ) : (
        <DataTable<{ id: string; cells: ReportCell[] }>
          caption={table.title}
          rows={rows}
          rowKey={(row) => row.id}
          columns={table.headers.map((header, index) => ({
            key: header,
            header,
            render: (row) => {
              const cell = row.cells[index];
              return cell === null || cell === undefined
                ? 'No data'
                : typeof cell === 'number'
                  ? cell.toLocaleString('en-PH', { maximumFractionDigits: 2 })
                  : cell;
            },
          }))}
        />
      )}
      {table.rows.length > 25 && (
        <nav aria-label={`${table.title} pages`} className="flex flex-wrap items-center gap-3">
          <Button variant="accent" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {Math.ceil(table.rows.length / 25)} · {table.rows.length} groups. CSV
            includes all groups.
          </span>
          <Button
            variant="accent"
            disabled={page * 25 >= table.rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </section>
  );
}

export function ReportsPage() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [applied, setApplied] = useState<{ kind: ReportKind; query: ReportQuery }>({
    kind: 'donations',
    query: { from: `${today.slice(0, 7)}-01`, to: today, format: 'json' },
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams();
  if (applied.query.from) params.set('from', applied.query.from);
  if (applied.query.to) params.set('to', applied.query.to);
  if (applied.query.campaignId) params.set('campaignId', applied.query.campaignId);
  const query = useApiQuery(
    ['reports', applied.kind, params.toString()],
    `/api/v1/reports/${applied.kind}?${params}`,
    reportResponseSchema,
  );
  const campaigns = useQuery({
    queryKey: ['report-campaigns'],
    queryFn: () => fetchAll('/api/v1/campaigns', campaignSchema),
  });

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = reportKindSchema.safeParse(form.get('kind'));
    const parsed = reportQuerySchema.safeParse({
      ...(form.get('from') ? { from: form.get('from') } : {}),
      ...(form.get('to') ? { to: form.get('to') } : {}),
      ...(form.get('campaignId') ? { campaignId: form.get('campaignId') } : {}),
    });
    if (!kind.success || !parsed.success) {
      setError(
        !parsed.success
          ? (parsed.error.issues[0]?.message ?? 'Check filters.')
          : 'Choose a report.',
      );
      return;
    }
    setError('');
    setNotice('');
    setApplied({ kind: kind.data, query: parsed.data });
    if (kind.data === applied.kind && JSON.stringify(parsed.data) === JSON.stringify(applied.query))
      query.refetch();
  }

  function download() {
    if (!query.data || query.error || query.isPending) return;
    try {
      const report = query.data.data;
      const url = URL.createObjectURL(
        new Blob([reportCsv(report)], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `agapay-${report.kind}-${report.asOf.slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV download started for the report shown.');
    } catch {
      setError('Could not download CSV. Try again.');
    }
  }

  return (
    <div className="min-w-0 space-y-6 break-words">
      <PageHeader
        title="Reports"
        description="Aggregate relief activity. Dates use Manila time; the To date includes the whole day."
        actions={
          <Button
            disabled={!query.data || query.isPending || query.error !== null}
            onClick={download}
          >
            Download CSV
          </Button>
        }
      />
      <form onSubmit={apply} className="flex flex-wrap items-end gap-4">
        <label className={filterLabelClass}>
          Report
          <select name="kind" className={selectClass} defaultValue="donations">
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={filterLabelClass}>
          From date
          <Input name="from" type="date" defaultValue={applied.query.from ?? ''} />
        </label>
        <label className={filterLabelClass}>
          To date
          <Input name="to" type="date" defaultValue={applied.query.to ?? ''} />
        </label>
        <label className={filterLabelClass}>
          Campaign
          <select name="campaignId" className={selectClass} disabled={campaigns.isPending}>
            <option value="">All campaigns</option>
            {campaigns.data?.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Apply filters</Button>
      </form>
      {campaigns.isPending && <p role="status">Loading campaigns…</p>}
      {campaigns.error && (
        <p role="alert">
          Campaign choices could not load. You can still view all campaigns.{' '}
          <button className="underline" onClick={() => void campaigns.refetch()}>
            Retry campaigns
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <AsyncBoundary
        data={query.data?.data ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading report…"
        isEmpty={() => false}
        emptyTitle="Report unavailable"
        emptyDescription="Retry loading the report."
      >
        {(report) => (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">{labels[report.kind]}</h2>
              <p className="text-sm text-text-muted">
                {report.from ?? 'All dates'} to {report.to ?? 'present'} ·{' '}
                {report.campaignId
                  ? (campaigns.data?.find((campaign) => campaign.id === report.campaignId)?.name ??
                    'Selected campaign')
                  : 'All campaigns'}{' '}
                · Snapshot{' '}
                {new Date(report.asOf).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
              </p>
              <p className="text-sm text-text-muted">
                {report.kind === 'inventory'
                  ? 'Stock is current. Date filters apply only to movements; this is not a historical stock balance.'
                  : report.kind === 'distributions'
                    ? 'Completed handovers only, dated by actual handover time. Quantities are actual goods handed over.'
                    : report.kind === 'requests'
                      ? 'Requests are dated by submission. Review averages include only records with valid review timestamps.'
                      : 'Donations are dated by submission. Declared and received quantities are shown separately.'}
              </p>
            </div>
            {report.total === 0 && <p>No matching records for these filters.</p>}
            {reportTables(report).map((table) => (
              <ReportTable
                key={`${applied.kind}:${params}:${report.asOf}:${table.title}`}
                table={table}
              />
            ))}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
