import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Report } from '@agapay/shared';
import { ReportContent } from './ReportContent';

export type PrintSnapshot = { report: Report; campaignLabel: string; preparedAt: string };

export function ReportPrint({
  snapshot,
  onFinish,
}: {
  snapshot: PrintSnapshot;
  onFinish: (failed: boolean) => void;
}) {
  useEffect(() => {
    const finish = () => onFinish(false);
    window.addEventListener('afterprint', finish);
    // Print only after React has committed the complete, frozen report to the document.
    const frame = requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        onFinish(true);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', finish);
    };
  }, [onFinish]);
  return createPortal(
    <article hidden className="report-print-root" aria-label="Printable report">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Agapay relief operations report</h1>
        <p>
          Prepared{' '}
          {new Date(snapshot.preparedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{' '}
          (Asia/Manila)
        </p>
      </header>
      <ReportContent
        report={snapshot.report}
        campaignLabel={snapshot.campaignLabel}
        paginated={false}
      />
    </article>,
    document.body,
  );
}
