import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  campaignSchema,
  reportKindSchema,
  reportQuerySchema,
  reportResponseSchema,
  reportCsv,
  type ReportKind,
  type ReportQuery,
} from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { fetchAll } from '../../lib/fetch-all';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import { Spinner } from '../../components/ui/spinner';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { FieldGroup, FieldLayout } from '../../components/ui/field';
import { Label } from '../../components/ui/label';
import { ReportContent, reportLabels as labels } from './ReportContent';
import { ReportPrint, type PrintSnapshot } from './ReportPrint';

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
  const [filterError, setFilterError] = useState('');
  const [printSnapshot, setPrintSnapshot] = useState<PrintSnapshot | null>(null);
  const printInFlight = useRef(false);
  const finishPrint = useCallback((failed: boolean) => {
    printInFlight.current = false;
    setPrintSnapshot(null);
    if (failed) {
      toast.error('Could not open the print dialog.');
    } else {
      toast.info('Print dialog closed. Your browser controls printing and saving.');
    }
  }, []);
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
  const exportDisabled =
    !query.data ||
    query.isFetching ||
    query.error !== null ||
    Boolean(filterError) ||
    printSnapshot !== null;
  const campaignLabel = query.data?.data.campaignId
    ? (campaigns.data?.find((campaign) => campaign.id === query.data?.data.campaignId)?.name ??
      `Campaign ID: ${query.data.data.campaignId}`)
    : 'All campaigns';

  function print() {
    if (exportDisabled || !query.data || printInFlight.current) return;
    printInFlight.current = true;
    setPrintSnapshot({
      report: query.data.data,
      campaignLabel,
      preparedAt: new Date().toISOString(),
    });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    if (printInFlight.current) return;
    const form = new FormData(event.currentTarget);
    const kind = reportKindSchema.safeParse(form.get('kind'));
    const parsed = reportQuerySchema.safeParse({
      ...(form.get('from') ? { from: form.get('from') } : {}),
      ...(form.get('to') ? { to: form.get('to') } : {}),
      ...(form.get('campaignId') ? { campaignId: form.get('campaignId') } : {}),
    });
    if (!kind.success || !parsed.success) {
      setFilterError(
        !parsed.success
          ? (parsed.error.issues[0]?.message ?? 'Check filters.')
          : 'Choose a report.',
      );
      return;
    }
    setFilterError('');
    setApplied({ kind: kind.data, query: parsed.data });
  }

  function download() {
    if (exportDisabled || !query.data) return;
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
      toast.success('CSV download started.');
    } catch {
      toast.error('Could not download CSV.');
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 wrap-break-word">
      <PageHeader
        title="Reports"
        description="Aggregate relief activity. Dates use Manila time; the To date includes the whole day."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={exportDisabled} onClick={download}>
              <Download data-icon="inline-start" aria-hidden="true" />
              Download CSV
            </Button>
            <Button disabled={exportDisabled} aria-busy={printSnapshot !== null} onClick={print}>
              {printSnapshot ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Printer data-icon="inline-start" aria-hidden="true" />
              )}
              {printSnapshot ? 'Preparing print…' : 'Print report'}
            </Button>
          </div>
        }
      />
      <form onSubmit={(event) => event.preventDefault()} onChange={apply}>
        <fieldset aria-label="Report filters" disabled={printSnapshot !== null} className="min-w-0">
          <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <FieldLayout>
              <Label htmlFor="report-kind">Report</Label>
              <NativeSelect id="report-kind" name="kind" defaultValue="donations">
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FieldLayout>
            <FieldLayout>
              <Label htmlFor="report-from">From date</Label>
              <Input
                id="report-from"
                name="from"
                type="date"
                aria-invalid={Boolean(filterError)}
                aria-describedby={filterError ? 'report-filter-error' : undefined}
                defaultValue={applied.query.from ?? ''}
              />
            </FieldLayout>
            <FieldLayout>
              <Label htmlFor="report-to">To date</Label>
              <Input
                id="report-to"
                name="to"
                type="date"
                defaultValue={applied.query.to ?? ''}
                aria-invalid={Boolean(filterError)}
                aria-describedby={filterError ? 'report-filter-error' : undefined}
              />
            </FieldLayout>
            <FieldLayout>
              <Label htmlFor="report-campaign">Campaign</Label>
              <NativeSelect id="report-campaign" name="campaignId" disabled={campaigns.isPending}>
                <option value="">All campaigns</option>
                {campaigns.data?.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </NativeSelect>
            </FieldLayout>
          </FieldGroup>
        </fieldset>
      </form>
      <p className="text-sm text-text-muted">
        Filters update automatically. Printing and CSV include all groups in the report shown,
        across every table page.
      </p>
      {filterError && (
        <Alert id="report-filter-error" variant="destructive">
          <AlertDescription>
            {filterError} The report below keeps the last valid filters.
          </AlertDescription>
        </Alert>
      )}
      {campaigns.isPending && <p role="status">Loading campaigns…</p>}
      {campaigns.error && (
        <p role="alert">
          Campaign choices could not load. You can still view all campaigns.{' '}
          <button className="underline" onClick={() => void campaigns.refetch()}>
            Retry campaigns
          </button>
        </p>
      )}
      <AsyncBoundary
        data={query.data?.data ?? null}
        error={query.error}
        isPending={query.isPending}
        isRefreshing={query.isFetching && !query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading report…"
        isEmpty={() => false}
        emptyTitle="Report unavailable"
        emptyDescription="Retry loading the report."
      >
        {(report) => (
          <ReportContent
            key={`${applied.kind}:${params}:${report.asOf}`}
            report={report}
            campaignLabel={campaignLabel}
          />
        )}
      </AsyncBoundary>
      {printSnapshot && <ReportPrint snapshot={printSnapshot} onFinish={finishPrint} />}
    </div>
  );
}
