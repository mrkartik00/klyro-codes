import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, requireTwoFactor } from '../middleware/rbac.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { leadsRouter } from './leads.routes.js';
import { outreachRouter } from './outreach.routes.js';
import { dealsRouter, quotationsRouter } from './deals.routes.js';
import { portfolioRouter, scrapeRouter, settingsRouter, auditRouter, organizationsRouter, enrollmentsRouter, automationRouter } from './settings.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { filesRouter } from './files.routes.js';
import { billingRouter } from './billing.routes.js';
import { inboxRouter } from './inbox.routes.js';
import { manageRouter } from './manage.routes.js';
import { schedulesRouter } from './schedules.routes.js';
import { clipRouter } from './clip.routes.js';

// All admin routes require an authenticated admin with 2FA, workspace-scoped.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin, requireTwoFactor, tenantScope);

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
adminRouter.use('/billing', billingRouter);
adminRouter.use('/inbox', inboxRouter);
adminRouter.use('/organizations', organizationsRouter);
adminRouter.use('/enrollments', enrollmentsRouter);
adminRouter.use('/automation', automationRouter);
adminRouter.use('/manage', manageRouter);
adminRouter.use('/schedules', schedulesRouter);
adminRouter.use('/clip', clipRouter);
