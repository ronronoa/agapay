import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  reportTables,
  type Report,
  type ReportKind,
  type ReportCell,
  type ReportTable as ReportTableData,
} from '@agapay/shared';
import { DataTable } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';

export const reportLabels: Record<ReportKind, string> = {
  donations: 'Donations',
  requests: 'Assistance requests',
  inventory: 'Inventory',
  distributions: 'Distributions',
};

function ReportTable({ table, paginated }: { table: ReportTableData; paginated: boolean }) {
  const [page, setPage] = useState(1);
  const rows = (paginated ? table.rows.slice((page - 1) * 25, page * 25) : table.rows).map(
    (cells, index) => ({ id: String(index), cells }),
  );
  return (
    <section aria-label={table.title} className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{table.title}</h3>
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
      {paginated && table.rows.length > 25 && (
        <nav aria-label={`${table.title} pages`} className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft data-icon="inline-start" aria-hidden="true" />
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {Math.ceil(table.rows.length / 25)} · {table.rows.length} groups. CSV
            includes all groups. Printing includes all groups.
          </span>
          <Button
            variant="outline"
            disabled={page * 25 >= table.rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </section>
  );
}

export function ReportContent({
  report,
  campaignLabel,
  paginated = true,
}: {
  report: Report;
  campaignLabel: string;
  paginated?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold">{reportLabels[report.kind]}</h2>
        <p className="text-sm text-text-muted">
          {report.from ?? 'All dates'} to {report.to ?? 'present'} (Manila, inclusive) ·{' '}
          {campaignLabel} · Snapshot{' '}
          {new Date(report.asOf).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Asia/Manila)
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
        <ReportTable key={`${report.asOf}:${table.title}`} table={table} paginated={paginated} />
      ))}
    </div>
  );
}
