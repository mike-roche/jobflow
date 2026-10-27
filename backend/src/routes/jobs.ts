import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { JOB_SOURCES, SOURCE_IDS, enabledSourceIds, searchSources, upsertJobs } from '../services/jobSources/index.js';

const router = Router();

const searchSchema = z.object({
  keywords: z.string().trim().min(1, 'Keywords required'),
  location: z.string().default(''),
  remote: z.boolean().default(false),
  sources: z.array(z.enum(SOURCE_IDS)).min(1)
});

router.get('/search', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { keywords, location, remote, sources } = searchSchema.parse({
      keywords: req.query.keywords,
      location: req.query.location || '',
      remote: req.query.remote === 'true',
      sources: req.query.sources
        ? (Array.isArray(req.query.sources)
            ? req.query.sources as string[]
            : (req.query.sources as string).split(','))
        : enabledSourceIds()
    });

    const { jobs, errors } = await searchSources(sources, { keywords, location, remote });

    await upsertJobs(req.userId!, jobs);

    res.json({
      jobs,
      total: jobs.length,
      sourcesSearched: sources,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Job search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.post('/save', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const saveSchema = z.object({
      source: z.string(),
      sourceId: z.string(),
      title: z.string(),
      company: z.string().optional(),
      location: z.string().optional(),
      remote: z.boolean().default(false),
      salaryMin: z.number().optional(),
      salaryMax: z.number().optional(),
      description: z.string().optional(),
      url: z.string().optional(),
      postedAt: z.string().datetime().optional()
    });

    const jobData = saveSchema.parse(req.body);

    const savedJob = await prisma.savedJob.upsert({
      where: {
        userId_source_sourceId: {
          userId: req.userId!,
          source: jobData.source,
          sourceId: jobData.sourceId
        }
      },
      update: jobData,
      create: {
        userId: req.userId!,
        ...jobData,
        postedAt: jobData.postedAt ? new Date(jobData.postedAt) : null
      }
    });

    res.status(201).json(savedJob);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Save job error:', error);
    res.status(500).json({ error: 'Failed to save job' });
  }
});

router.get('/saved', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const savedJobs = await prisma.savedJob.findMany({
      where: { userId: req.userId },
      orderBy: { savedAt: 'desc' }
    });

    res.json({ jobs: savedJobs });
  } catch (error) {
    console.error('Get saved jobs error:', error);
    res.status(500).json({ error: 'Failed to get saved jobs' });
  }
});

router.delete('/saved/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const job = await prisma.savedJob.findFirst({
      where: { id: req.params.id, userId: req.userId }
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    await prisma.savedJob.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete saved job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

router.get('/sources', (_, res) => {
  res.json({
    sources: JOB_SOURCES.map(s => ({ id: s.id, name: s.name, enabled: s.isEnabled(), docs: s.docs }))
  });
});

export default router;