import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { leadsRouter } from './leads.routes.js';
import { outreachRouter } from './outreach.routes.js';
import { dealsRouter, quotationsRouter } from './deals.routes.js';
import { portfolioRouter, scrapeRouter, settingsRouter, auditRouter } from './settings.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { filesRouter } from './files.routes.js';

// All admin routes require an authenticated admin and are workspace-scoped.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin, tenantScope);

adminRouter.use('/leads', leadsRouter);
adminRouter.use('/outreach', outreachRouter);
adminRouter.use('/deals', dealsRouter);
adminRouter.use('/quotations', quotationsRouter);
adminRouter.use('/portfolio', portfolioRouter);
adminRouter.use('/scrape', scrapeRouter);
adminRouter.use('/settings', settingsRouter);
adminRouter.use('/audit-logs', auditRouter);
adminRouter.use('/analytics', analyticsRouter);
adminRouter.use('/files', filesRouter);
