import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';
import { getState } from '../lib/state.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { isPipelineEnabled, isPipelineRunning, MIN_DESCRIPTION_LENGTH, tailorJob, triggerPipeline } from '../services/pipeline.js';

const router = Router();

async function findJob(req: AuthRequest) {
  return prisma.savedJob.findFirst({ where: { id: String(req.params.id), userId: req.userId } });
}

router.get('/queue', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const jobs = await prisma.savedJob.findMany({
      where: { userId: req.userId, pipelineStatus: { in: ['ready', 'needs_description', 'queued', 'tailoring', 'failed'] } },
      orderBy: [{ triageScore: 'desc' }, { savedAt: 'desc' }],
      include: { customizations: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    const items = jobs.map(({ customizations, ...job }) => {
      const tailored = customizations[0];
      return {
        job,
        tailored: tailored && {
          id: tailored.id,
          cv: JSON.parse(tailored.customizedData),
          coverLetter: tailored.coverLetter,
          matchScore: tailored.matchScore,
          createdAt: tailored.createdAt
        }
      };
    });

    res.json({ items });
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Failed to load queue' });
  }
});

router.get('/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const [hasCv, counts] = await Promise.all([
      prisma.baseCv.count({ where: { userId: req.userId } }),
      prisma.savedJob.groupBy({ by: ['pipelineStatus'], where: { userId: req.userId }, _count: true })
    ]);
    const today = await getState(`pipeline.tailored.${new Date().toISOString().slice(0, 10)}`);

    res.json({
      enabled: isPipelineEnabled(),
      hasCv: hasCv > 0,
      running: isPipelineRunning(),
      minScore: parseInt(process.env.PIPELINE_MIN_SCORE || '70'),
      dailyLimit: parseInt(process.env.PIPELINE_DAILY_TAILOR_LIMIT || '10'),
      tailoredToday: parseInt(today || '0'),
      counts: Object.fromEntries(counts.map(c => [c.pipelineStatus ?? 'unscreened', c._count]))
    });
  } catch (error) {
    console.error('Pipeline status error:', error);
    res.status(500).json({ error: 'Failed to load pipeline status' });
  }
});

router.post('/run', authMiddleware, async (_req: AuthRequest, res) => {
  if (!isPipelineEnabled()) {
    res.status(400).json({ error: 'No AI provider is configured' });
    return;
  }
  triggerPipeline().catch(error => console.error('Pipeline run failed:', error));
  res.status(202).json({ started: true });
});

router.post('/jobs/:id/description', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { description } = z.object({
      description: z.string().trim().min(MIN_DESCRIPTION_LENGTH, 'Paste the full job description')
    }).parse(req.body);

    const job = await findJob(req);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    await prisma.savedJob.update({ where: { id: job.id }, data: { description, pipelineStatus: 'queued' } });
    // Tailor right away rather than waiting for the next scheduled run
    tailorJob(job.id).catch(error => console.error(`Tailoring ${job.id} failed:`, error));
    res.status(202).json({ queued: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0]?.message || 'Invalid description' });
      return;
    }
    console.error('Save description error:', error);
    res.status(500).json({ error: 'Failed to save description' });
  }
});

router.post('/jobs/:id/retry', authMiddleware, async (req: AuthRequest, res) => {
  const job = await findJob(req);
  if (!job || job.pipelineStatus !== 'failed') {
    res.status(404).json({ error: 'No failed job to retry' });
    return;
  }
  tailorJob(job.id).catch(error => console.error(`Tailoring ${job.id} failed:`, error));
  res.status(202).json({ queued: true });
});

router.post('/jobs/:id/applied', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const job = await findJob(req);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const tailored = await prisma.cvCustomization.findFirst({
      where: { jobId: job.id, userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    const application = await prisma.application.create({
      data: {
        userId: req.userId!,
        jobId: job.id,
        baseCvId: tailored?.baseCvId,
        status: 'applied',
        appliedVia: 'manual',
        appliedAt: new Date()
      }
    });
    await prisma.savedJob.update({ where: { id: job.id }, data: { pipelineStatus: 'applied' } });

    res.status(201).json(application);
  } catch (error) {
    console.error('Mark applied error:', error);
    res.status(500).json({ error: 'Failed to mark as applied' });
  }
});

router.post('/jobs/:id/skip', authMiddleware, async (req: AuthRequest, res) => {
  const job = await findJob(req);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  await prisma.savedJob.update({ where: { id: job.id }, data: { pipelineStatus: 'skipped' } });
  res.json({ skipped: true });
});

export default router;
