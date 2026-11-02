'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Inbox, MapPin, ExternalLink, Download, FileText, Check, X, RefreshCw, Play, Loader2, AlertTriangle, ClipboardCopy
} from 'lucide-react';
import { pipelineApi, exportApi, type QueueItem, type PipelineStatus } from '@/lib/api';

function formatSalary(job: QueueItem['job']): string {
  if (job.salary) return job.salary;
  if (!job.salaryMin) return '';
  return `$${job.salaryMin.toLocaleString()}${job.salaryMax ? ` - $${job.salaryMax.toLocaleString()}` : ''}`;
}

function JobHeader({ item }: { item: QueueItem }) {
  const { job } = item;
  const score = item.tailored?.matchScore ?? job.triageScore;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h3 className="text-lg font-semibold">{job.title}</h3>
        {score != null && (
          <span
            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
            }`}
            title={item.tailored ? 'Match score against the full description' : 'Quick fit score from the listing'}
          >
            {score}% match
          </span>
        )}
      </div>
      <p className="text-gray-600">{job.company}</p>
      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1 flex-wrap">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin size={14} />
            {job.location}
          </span>
        )}
        {formatSalary(job) && <span className="text-green-600 font-medium">{formatSalary(job)}</span>}
      </div>
      {job.triageReason && <p className="text-sm text-gray-500 mt-2 italic">{job.triageReason}</p>}
    </div>
  );
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [openLetter, setOpenLetter] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [queue, pipelineStatus] = await Promise.all([pipelineApi.queue(), pipelineApi.status()]);
      setItems(queue.items);
      setStatus(pipelineStatus);
    } catch (error) {
      console.error('Failed to load queue:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh while something is being processed in the background
  const working = status?.running || items.some(i => i.job.pipelineStatus === 'tailoring' || i.job.pipelineStatus === 'queued');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [working, load]);

  const act = async (jobId: string, action: () => Promise<void>) => {
    setBusy(jobId);
    setErrors(prev => ({ ...prev, [jobId]: '' }));
    try {
      await action();
      await load();
    } catch (error: any) {
      setErrors(prev => ({ ...prev, [jobId]: error?.response?.data?.error || 'Something went wrong' }));
    } finally {
      setBusy(null);
    }
  };

  const downloadCv = async (item: QueueItem) => {
    if (!item.tailored) return;
    const name = `cv-${item.job.company || 'company'}-${item.job.title}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
    const blob = await exportApi.toDocx(item.tailored.cv, name);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ready = items.filter(i => i.job.pipelineStatus === 'ready');
  const needsDescription = items.filter(i => i.job.pipelineStatus === 'needs_description');
  const inProgress = items.filter(i => i.job.pipelineStatus === 'queued' || i.job.pipelineStatus === 'tailoring');
  const failed = items.filter(i => i.job.pipelineStatus === 'failed');

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Ready to Apply</h1>
          {status && (
            <p className="text-sm text-gray-500 mt-1">
              Jobs scoring {status.minScore}+ are tailored automatically · {status.tailoredToday} of {status.dailyLimit} tailored today
              {status.counts.unscreened ? ` · ${status.counts.unscreened} waiting to be screened` : ''}
            </p>
          )}
        </div>
        <button
          onClick={async () => {
            await pipelineApi.run();
            await load();
          }}
          disabled={!status?.enabled || !status?.hasCv || status?.running}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {status?.running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          {status?.running ? 'Running…' : 'Run now'}
        </button>
      </div>

      {status && !status.enabled && (
        <div className="flex items-center gap-2 text-sm text-yellow-800 bg-yellow-50 px-4 py-3 rounded-lg">
          <AlertTriangle size={18} />
          Auto-tailoring needs an AI provider. Add an Anthropic API key or set up your Claude subscription in .env, then restart.
        </div>
      )}
      {status?.enabled && !status.hasCv && (
        <div className="flex items-center gap-2 text-sm text-yellow-800 bg-yellow-50 px-4 py-3 rounded-lg">
          <AlertTriangle size={18} />
          <span>
            Upload your CV on the <Link href="/dashboard/cv" className="underline">My CV</Link> page to start tailoring.
          </span>
        </div>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-3">Ready ({ready.length})</h2>
        {ready.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-gray-200">
            <Inbox size={40} className="mx-auto mb-2 text-gray-300" />
            Nothing ready yet. Tailored applications show up here.
          </div>
        ) : (
          <div className="space-y-4">
            {ready.map(item => (
              <div key={item.job.id} className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="flex items-start gap-4 flex-wrap">
                  <JobHeader item={item} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => downloadCv(item)} className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                      <Download size={16} /> CV
                    </button>
                    <button
                      onClick={() => setOpenLetter(openLetter === item.job.id ? null : item.job.id)}
                      className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <FileText size={16} /> Cover letter
                    </button>
                    {item.job.url && (
                      <a href={item.job.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
                        <ExternalLink size={16} /> Open job
                      </a>
                    )}
                    <button
                      onClick={() => act(item.job.id, () => pipelineApi.markApplied(item.job.id))}
                      disabled={busy === item.job.id}
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      <Check size={16} /> Applied
                    </button>
                    <button
                      onClick={() => act(item.job.id, () => pipelineApi.skip(item.job.id))}
                      disabled={busy === item.job.id}
                      className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                      title="Not interested"
                    >
                      <X size={16} /> Skip
                    </button>
                  </div>
                </div>
                {openLetter === item.job.id && item.tailored?.coverLetter && (
                  <div className="mt-4 relative">
                    <button
                      onClick={() => navigator.clipboard.writeText(item.tailored!.coverLetter!)}
                      className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      <ClipboardCopy size={14} /> Copy
                    </button>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 bg-gray-50 p-4 pr-20 rounded-lg">{item.tailored.coverLetter}</pre>
                  </div>
                )}
                {errors[item.job.id] && <p className="text-sm text-red-600 mt-2">{errors[item.job.id]}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {inProgress.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Tailoring ({inProgress.length})</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y">
            {inProgress.map(item => (
              <div key={item.job.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                {item.job.pipelineStatus === 'tailoring'
                  ? <Loader2 size={16} className="animate-spin text-primary" />
                  : <span className="text-gray-400 text-xs w-4">…</span>}
                <span className="font-medium">{item.job.title}</span>
                <span className="text-gray-500">{item.job.company}</span>
                <span className="ml-auto text-gray-400">{item.job.pipelineStatus === 'tailoring' ? 'tailoring now' : 'waiting (daily limit or next run)'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {needsDescription.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-1">Needs description ({needsDescription.length})</h2>
          <p className="text-sm text-gray-500 mb-3">
            These scored well, but the full job description couldn't be fetched. Open the job, copy the description, and paste it here to tailor.
          </p>
          <div className="space-y-4">
            {needsDescription.map(item => (
              <div key={item.job.id} className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="flex items-start gap-4 flex-wrap mb-3">
                  <JobHeader item={item} />
                  <div className="flex items-center gap-2">
                    {item.job.url && (
                      <a href={item.job.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
                        <ExternalLink size={16} /> Open job
                      </a>
                    )}
                    <button
                      onClick={() => act(item.job.id, () => pipelineApi.skip(item.job.id))}
                      className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100"
                    >
                      <X size={16} /> Skip
                    </button>
                  </div>
                </div>
                <textarea
                  value={drafts[item.job.id] || ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [item.job.id]: e.target.value }))}
                  placeholder="Paste the full job description…"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-red-600">{errors[item.job.id]}</span>
                  <button
                    onClick={() => act(item.job.id, () => pipelineApi.addDescription(item.job.id, drafts[item.job.id] || ''))}
                    disabled={busy === item.job.id || !(drafts[item.job.id] || '').trim()}
                    className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    Tailor
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Failed ({failed.length})</h2>
          <div className="space-y-3">
            {failed.map(item => (
              <div key={item.job.id} className="bg-white p-4 rounded-xl border border-red-200 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{item.job.title} <span className="text-gray-500 font-normal">· {item.job.company}</span></p>
                  <p className="text-sm text-red-600">{item.job.pipelineError}</p>
                </div>
                <button
                  onClick={() => act(item.job.id, () => pipelineApi.retry(item.job.id))}
                  disabled={busy === item.job.id}
                  className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw size={16} /> Retry
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
