import { z } from 'zod';

export const reportKindSchema = z.enum(['donations', 'requests', 'inventory', 'distributions']);
export type ReportKind = z.infer<typeof reportKindSchema>;
export const reportQuerySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    campaignId: z.string().uuid().optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'From date must be on or before To date.',
    path: ['to'],
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
const count = z.number().int().nonnegative();
const campaignCount = z.object({ campaignId: z.string(), campaignName: z.string(), count });
const statusCount = z.object({ status: z.string(), count });
const base = {
  asOf: z.string().datetime(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  campaignId: z.string().nullable(),
};
export const reportSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('donations'),
    total: count,
    byStatus: z.array(statusCount),
    byCampaign: z.array(campaignCount),
    byItem: z.array(
      z.object({
        itemTypeId: z.string(),
        itemTypeName: z.string(),
        unit: z.string(),
        declared: count,
        received: count,
      }),
    ),
    byMonth: z.array(z.object({ month: z.string(), count })),
  }),
  z.object({
    ...base,
    kind: z.literal('requests'),
    total: count,
    averageReviewHours: z.number().nonnegative().nullable(),
    byStatus: z.array(statusCount),
    byCampaign: z.array(campaignCount),
    byBarangay: z.array(
      z.object({ barangay: z.string(), city: z.string(), province: z.string(), count }),
    ),
  }),
  z.object({
    ...base,
    kind: z.literal('inventory'),
    total: count,
    lowStockRows: count,
    stock: z.array(
      z.object({
        campaignName: z.string(),
        itemTypeName: z.string(),
        unit: z.string(),
        available: count,
        reserved: count,
        distributed: count,
        lowStock: z.boolean(),
      }),
    ),
    movements: z.array(
      z.object({
        campaignName: z.string(),
        itemTypeName: z.string(),
        unit: z.string(),
        type: z.string(),
        quantity: count,
      }),
    ),
  }),
  z.object({
    ...base,
    kind: z.literal('distributions'),
    total: count,
    units: count,
    byCampaign: z.array(campaignCount),
    byItem: z.array(
      z.object({
        itemTypeId: z.string(),
        itemTypeName: z.string(),
        unit: z.string(),
        quantity: count,
      }),
    ),
    byBarangay: z.array(
      z.object({
        barangay: z.string(),
        city: z.string(),
        province: z.string(),
        handovers: count,
        quantity: count,
      }),
    ),
  }),
]);
export type Report = z.infer<typeof reportSchema>;
export const reportResponseSchema = z.object({ data: reportSchema });
export type ReportCell = string | number | null;
export interface ReportTable {
  title: string;
  headers: string[];
  rows: ReportCell[][];
}

// The screen and CSV share presentation mappings; business totals live in the API.
export function reportTables(report: Report): ReportTable[] {
  const campaigns = (label: string): ReportTable => ({
    title: 'By campaign',
    headers: ['Campaign', label],
    rows:
      'byCampaign' in report ? report.byCampaign.map((row) => [row.campaignName, row.count]) : [],
  });
  switch (report.kind) {
    case 'donations':
      return [
        {
          title: 'Summary',
          headers: ['Metric', 'Value'],
          rows: [['Donations submitted', report.total]],
        },
        {
          title: 'By status',
          headers: ['Status', 'Donations'],
          rows: report.byStatus.map((row) => [row.status, row.count]),
        },
        campaigns('Donations'),
        {
          title: 'By item',
          headers: ['Item', 'Unit', 'Declared', 'Received'],
          rows: report.byItem.map((row) => [
            row.itemTypeName,
            row.unit,
            row.declared,
            row.received,
          ]),
        },
        {
          title: 'By month (Manila)',
          headers: ['Month', 'Donations'],
          rows: report.byMonth.map((row) => [row.month, row.count]),
        },
      ];
    case 'requests':
      return [
        {
          title: 'Summary',
          headers: ['Metric', 'Value'],
          rows: [
            ['Requests submitted', report.total],
            ['Average review time (hours)', report.averageReviewHours],
          ],
        },
        {
          title: 'By status',
          headers: ['Status', 'Requests'],
          rows: report.byStatus.map((row) => [row.status, row.count]),
        },
        campaigns('Requests'),
        {
          title: 'By barangay',
          headers: ['Barangay', 'City', 'Province', 'Requests'],
          rows: report.byBarangay.map((row) => [row.barangay, row.city, row.province, row.count]),
        },
      ];
    case 'inventory':
      return [
        {
          title: 'Summary',
          headers: ['Metric', 'Value'],
          rows: [
            ['Current stock rows', report.total],
            ['Low stock rows', report.lowStockRows],
          ],
        },
        {
          title: 'Current stock',
          headers: [
            'Campaign',
            'Item',
            'Unit',
            'Available',
            'Reserved',
            'Distributed',
            'Low stock',
          ],
          rows: report.stock.map((row) => [
            row.campaignName,
            row.itemTypeName,
            row.unit,
            row.available,
            row.reserved,
            row.distributed,
            row.lowStock ? 'Yes' : 'No',
          ]),
        },
        {
          title: 'Movements in selected dates',
          headers: ['Campaign', 'Item', 'Unit', 'Movement', 'Quantity'],
          rows: report.movements.map((row) => [
            row.campaignName,
            row.itemTypeName,
            row.unit,
            row.type,
            row.quantity,
          ]),
        },
      ];
    case 'distributions':
      return [
        {
          title: 'Summary',
          headers: ['Metric', 'Value'],
          rows: [
            ['Completed handovers', report.total],
            ['Units handed over', report.units],
          ],
        },
        campaigns('Handovers'),
        {
          title: 'By item',
          headers: ['Item', 'Unit', 'Quantity'],
          rows: report.byItem.map((row) => [row.itemTypeName, row.unit, row.quantity]),
        },
        {
          title: 'By barangay',
          headers: ['Barangay', 'City', 'Province', 'Handovers', 'Quantity'],
          rows: report.byBarangay.map((row) => [
            row.barangay,
            row.city,
            row.province,
            row.handovers,
            row.quantity,
          ]),
        },
      ];
  }
}

function csvCell(value: ReportCell): string {
  const text = value === null ? '' : String(value);
  const safe = typeof value === 'string' && /^[\s\p{Cc}]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function reportCsv(report: Report): string {
  const tables: ReportTable[] = [
    {
      title: 'Filters',
      headers: ['Metric', 'Value'],
      rows: [
        ['Report', report.kind],
        ['Snapshot (UTC)', report.asOf],
        ['From date (Manila)', report.from],
        ['To date (Manila, inclusive)', report.to],
        ['Campaign ID (blank means all)', report.campaignId],
      ],
    },
    ...reportTables(report),
  ];
  const headers = ['Section', ...new Set(tables.flatMap((table) => table.headers))];
  const rows: ReportCell[][] = [headers];
  for (const table of tables)
    for (const row of table.rows) {
      rows.push(
        headers.map((header) =>
          header === 'Section' ? table.title : (row[table.headers.indexOf(header)] ?? null),
        ),
      );
    }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
