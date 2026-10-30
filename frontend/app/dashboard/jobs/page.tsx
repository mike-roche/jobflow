'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Briefcase, Bookmark, ExternalLink, Wifi, Wand2, ChevronDown, X } from 'lucide-react';
import { jobApi, type Job, type JobSourceInfo } from '@/lib/api';

const SOURCE_CONFIG: Record<string, { name: string; color: string }> = {
  remotive: { name: 'Remotive', color: 'bg-teal-100 text-teal-700' },
  remoteok: { name: 'Remote OK', color: 'bg-rose-100 text-rose-700' },
  arbeitnow: { name: 'Arbeitnow', color: 'bg-amber-100 text-amber-700' },
  jooble: { name: 'Jooble', color: 'bg-orange-100 text-orange-700' },
  indeed: { name: 'Indeed', color: 'bg-blue-100 text-blue-700' },
  adzuna: { name: 'Adzuna', color: 'bg-green-100 text-green-700' },
  'linkedin-email': { name: 'LinkedIn alert', color: 'bg-sky-100 text-sky-700' },
  'indeed-email': { name: 'Indeed alert', color: 'bg-blue-100 text-blue-700' }
};

function sourceBadge(source: string) {
  return SOURCE_CONFIG[source] || { name: source, color: 'bg-gray-100 text-gray-700' };
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [availableSources, setAvailableSources] = useState<JobSourceInfo[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [showSourceFilter, setShowSourceFilter] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    loadSavedJobs();
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const data = await jobApi.sources();
      const enabled = data.sources.filter(s => s.enabled);
      setAvailableSources(enabled);
      setActiveSources(enabled.map(s => s.id));
    } catch (error) {
      console.error('Failed to load job sources:', error);
    }
  };

  const loadSavedJobs = async () => {
    try {
      const data = await jobApi.saved();
      setSavedJobs(data.jobs || []);
      const map = new Map<string, string>();
      data.jobs.forEach((j: Job & { id?: string }) => {
        if (j.id) map.set(`${j.source}-${j.sourceId}`, j.id);
      });
      setSavedJobIds(map);
    } catch (error) {
      console.error('Failed to load saved jobs:', error);
    }
  };

  const toggleSource = (source: string) => {
    if (activeSources.includes(source)) {
      if (activeSources.length > 1) {
        setActiveSources(activeSources.filter(s => s !== source));
      }
    } else {
      setActiveSources([...activeSources, source]);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;

    setLoading(true);
    setSearched(true);
    setErrors([]);

    try {
      const data = await jobApi.search({
        keywords: search,
        location,
        remote,
        sources: activeSources
      });
      setJobs(data.jobs);
      if (data.errors) {
        setErrors(data.errors);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSaveJob = async (job: Job) => {
    const key = `${job.source}-${job.sourceId}`;
    
    if (savedJobIds.has(key)) {
      const savedId = savedJobIds.get(key);
      if (savedId) {
        try {
          await jobApi.deleteSaved(savedId);
        } catch (error) {
          console.error('Failed to delete saved job:', error);
        }
      }
      savedJobIds.delete(key);
      setSavedJobIds(new Map(savedJobIds));
    } else {
      try {
        const saved = await jobApi.save(job);
        savedJobIds.set(key, saved.id);
        setSavedJobIds(new Map(savedJobIds));
      } catch (error) {
        console.error('Failed to save job:', error);
      }
    }
  };

  const handleTailor = (jobId: string) => {
    router.push(`/dashboard/tailor/${jobId}`);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-6">Find Jobs</h1>
        
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Job title, keywords..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="w-[250px]">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, country..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
            
            <label className="flex items-center gap-2 px-4 py-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={remote}
                onChange={(e) => setRemote(e.target.checked)}
                className="w-4 h-4 text-primary rounded"
              />
              <span className="text-sm">Remote only</span>
            </label>
            
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSourceFilter(!showSourceFilter)}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Sources ({activeSources.length})
                <ChevronDown size={18} />
              </button>
              
              {showSourceFilter && (
                <div className="absolute top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-10 min-w-[200px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Job Sources</span>
                    <button onClick={() => setShowSourceFilter(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                  {availableSources.map(source => (
                    <label key={source.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeSources.includes(source.id)}
                        onChange={() => toggleSource(source.id)}
                        className="w-4 h-4 text-primary rounded"
                      />
                      <span className="text-sm">{source.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            
            <button
              type="submit"
              disabled={loading || activeSources.length === 0}
              className="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {errors.length > 0 && (
            <div className="text-sm text-yellow-600 bg-yellow-50 px-3 py-2 rounded">
              Some sources unavailable: {errors.join(', ')}
            </div>
          )}
        </form>
      </div>

      {!searched && savedJobs.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Briefcase size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">No saved jobs</p>
          <p className="text-sm">Search for jobs to get started</p>
        </div>
      )}

      {!searched && savedJobs.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{savedJobs.length} saved jobs</p>
          </div>
          <div className="space-y-4">
            {savedJobs.map((job) => {
              const key = `${job.source}-${job.sourceId}`;
              const isSaved = savedJobIds.has(key);
              const savedJobId = savedJobIds.get(key);
              const sourceConfig = sourceBadge(job.source);
              
              return (
                <div
                  key={key}
                  className="bg-white p-6 rounded-xl border border-gray-200 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{job.title}</h3>
                        {job.remote && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                            <Wifi size={12} />
                            Wifi
                          </span>
                        )}
                        <span className={`px-2 py-1 text-xs rounded-full ${sourceConfig.color}`}>
                          {sourceConfig.name}
                        </span>
                      </div>
                      <p className="text-gray-600 mb-2">{job.company}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={14} />
                            {job.location}
                          </span>
                        )}
                        {job.salaryMin && (
                          <span className="text-green-600 font-medium">
                            ${job.salaryMin.toLocaleString()}{job.salaryMax ? ` - $${job.salaryMax.toLocaleString()}` : ''}
                          </span>
                        )}
                      </div>
                      {job.description && (
                        <p className="mt-3 text-gray-700 line-clamp-2">{job.description}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSaveJob(job)}
                        className={`p-2 rounded-lg transition-colors ${
                          isSaved
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Bookmark size={20} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                      {isSaved && savedJobId && (
                        <button
                          onClick={() => handleTailor(savedJobId)}
                          className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors"
                        >
                          <Wand2 size={18} />
                          Tailor
                        </button>
                      )}
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <ExternalLink size={18} />
                          Apply
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {searched && jobs.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">No jobs found</p>
          <p className="text-sm">Try different keywords, location, or sources</p>
        </div>
      )}

      {searched && jobs.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{jobs.length} jobs found</p>
          </div>
          <div className="space-y-4">
            {jobs.map((job) => {
              const key = `${job.source}-${job.sourceId}`;
              const isSaved = savedJobIds.has(key);
              const savedJobId = savedJobIds.get(key);
              const sourceConfig = sourceBadge(job.source);
              
              return (
                <div
                  key={key}
                  className="bg-white p-6 rounded-xl border border-gray-200 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{job.title}</h3>
                        {job.remote && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                            <Wifi size={12} />
                            Wifi
                          </span>
                        )}
                        <span className={`px-2 py-1 text-xs rounded-full ${sourceConfig.color}`}>
                          {sourceConfig.name}
                        </span>
                      </div>
                      <p className="text-gray-600 mb-2">{job.company}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={14} />
                            {job.location}
                          </span>
                        )}
                        {job.salaryMin && (
                          <span className="text-green-600 font-medium">
                            ${job.salaryMin.toLocaleString()}{job.salaryMax ? ` - $${job.salaryMax.toLocaleString()}` : ''}
                          </span>
                        )}
                      </div>
                      {job.description && (
                        <p className="mt-3 text-gray-700 line-clamp-2">{job.description}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSaveJob(job)}
                        className={`p-2 rounded-lg transition-colors ${
                          isSaved
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Bookmark size={20} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                      {isSaved && savedJobId && (
                        <button
                          onClick={() => handleTailor(savedJobId)}
                          className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors"
                        >
                          <Wand2 size={18} />
                          Tailor
                        </button>
                      )}
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <ExternalLink size={18} />
                          Apply
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}