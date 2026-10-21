import { Router } from 'express';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import { systemClock } from '../../lib/clock.js';
import * as service from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get('/admin', requireRole('ADMIN', 'STAFF'), async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ data: await service.adminDashboard(systemClock.now()) });
});

dashboardRouter.get('/donor', requireRole('DONOR'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ data: await service.donorDashboard(actorFrom(req), systemClock.now()) });
});
