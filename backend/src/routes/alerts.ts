import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { findMatchingJobs, runDueAlerts } from '../services/alerts.js';

const router = Router();

const createAlertSchema = z.object({
  name: z.string().optional(),
  keywords: z.string().min(1),
  location: z.string().default(''),
  remote: z.boolean().default(false),
  frequency: z.enum(['daily', 'weekly']).default('daily')
});

const updateAlertSchema = z.object({
  name: z.string().optional(),
  frequency: z.enum(['daily', 'weekly']).optional(),
  active: z.boolean().optional()
});

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const alerts = await prisma.jobAlert.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    const alertsWithCriteria = alerts.map(alert => ({
      ...alert,
      criteria: JSON.parse(alert.criteria)
    }));

    res.json({ alerts: alertsWithCriteria });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, keywords, location, remote, frequency } = createAlertSchema.parse(req.body);

    const alert = await prisma.jobAlert.create({
      data: {
        userId: req.userId!,
        name: name || keywords,
        criteria: JSON.stringify({ keywords, location, remote }),
        frequency,
        active: true
      }
    });

    res.status(201).json({
      ...alert,
      criteria: JSON.parse(alert.criteria)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, frequency, active } = updateAlertSchema.parse(req.body);

    const alert = await prisma.jobAlert.findFirst({
      where: { id: req.params.id, userId: req.userId }
    });

    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    const updated = await prisma.jobAlert.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(frequency !== undefined && { frequency }),
        ...(active !== undefined && { active })
      }
    });

    res.json({
      ...updated,
      criteria: JSON.parse(updated.criteria)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Update alert error:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const alert = await prisma.jobAlert.findFirst({
      where: { id: req.params.id, userId: req.userId }
    });

    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    await prisma.jobAlert.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

router.post('/:id/test', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const alert = await prisma.jobAlert.findFirst({
      where: { id: req.params.id, userId: req.userId }
    });

    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    const criteria = JSON.parse(alert.criteria);
    const matchingJobs = await findMatchingJobs(alert.userId, criteria, alert.lastSentAt);

    res.json({
      alertId: alert.id,
      matchingJobs: matchingJobs.slice(0, 5),
      totalMatches: matchingJobs.length
    });
  } catch (error) {
    console.error('Test alert error:', error);
    res.status(500).json({ error: 'Failed to test alert' });
  }
});

// Alerts also run on the in-process scheduler; this endpoint is for triggering from an external cron.
// It isn't tied to a user, so it requires the shared CRON_SECRET.
router.post('/check-all', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('x-cron-secret') !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    res.json(await runDueAlerts());
  } catch (error) {
    console.error('Check all alerts error:', error);
    res.status(500).json({ error: 'Failed to check alerts' });
  }
});

export default router;