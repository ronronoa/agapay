import { describe, expect, it } from 'vitest';
import { reportQuerySchema, reportCsv, reportTables, type Report } from './reports.js';

const report: Report = {
  kind: 'donations',
  asOf: '2026-10-22T00:00:00.000Z',
  from: null,
  to: null,
  campaignId: null,
  total: 121,
  byStatus: [{ status: 'COMPLETED', count: 121 }],
  byCampaign: [{ campaignId: 'example', campaignName: '=SUM(1,2)', count: 121 }],
  byMonth: [{ month: '2026-10', count: 121 }],
  byItem: [
    {
      itemTypeId: 'item',
      itemTypeName: 'Food, "packs"\r\nRelief',
      unit: 'pack',
      declared: 605,
      received: 363,
    },
  ],
};

describe('report filters and CSV', () => {
  it('validates real dates, ranges, query keys and campaign identifiers', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '2026-11-02', to: '2026-11-01' }).success).toBe(
      false,
    );
    expect(reportQuerySchema.safeParse({ campaignId: 'bad' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ q: 'private' }).success).toBe(false);
    expect(reportQuerySchema.parse({ from: '2024-02-29', to: '2024-02-29' }).format).toBe('json');
  });
  it('exports all displayed measures with BOM, quoting and formula protection', () => {
    const csv = reportCsv(report);
    expect(csv.startsWith('\uFEFF"Section","Metric","Value"')).toBe(true);
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"Food, ""packs""\r\nRelief"');
    expect(csv).toContain('"605","363"');
    expect(reportTables(report).find((table) => table.title === 'By status')?.rows).toEqual([
      ['COMPLETED', 121],
    ]);
    expect(csv).toContain('"COMPLETED","121"');
  });
  it('neutralises formula prefixes even after whitespace and controls', () => {
    for (const name of ['+1', '-1', '@SUM(A1)', ' \t=1', '\r\n+1', '\u0000=1']) {
      const csv = reportCsv({
        ...report,
        byCampaign: [{ campaignId: 'example', campaignName: name, count: 1 }],
      });
      expect(csv).toContain(`"'${name}"`);
    }
  });
  it('keeps every aggregate group in the export beyond the display page size', () => {
    const csv = reportCsv({
      ...report,
      byItem: Array.from({ length: 121 }, (_, i) => ({
        itemTypeId: String(i),
        itemTypeName: `Item ${i}`,
        unit: 'pack',
        declared: i + 1,
        received: i,
      })),
    });
    expect(csv).toContain('"Item 120"');
    expect(csv).toContain('"121","120"');
  });
});
