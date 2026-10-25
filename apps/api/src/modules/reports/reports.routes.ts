import { Router } from 'express';
import { reportKindSchema, reportQuerySchema, reportCsv, reportSchema } from '@agapay/shared';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { validationError } from '../../lib/errors.js';
import { systemClock } from '../../lib/clock.js';
import * as service from './reports.service.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));
reportsRouter.get('/:kind', async (req, res) => {
  const kind = reportKindSchema.safeParse(req.params['kind']);
  const query = reportQuerySchema.safeParse(req.query);
  if (!kind.success) throw validationError(kind.error.flatten());
  if (!query.success) throw validationError(query.error.flatten());
  const report = reportSchema.parse(
    await service.generate(kind.data, query.data, systemClock.now()),
  );
  res.setHeader('Cache-Control', 'no-store');
  if (query.data.format === 'csv') {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="agapay-${report.kind}-${report.asOf.slice(0, 10)}.csv"`,
    );
    res.type('text/csv').send(reportCsv(report));
    return;
  }
  res.json({ data: report });
});
