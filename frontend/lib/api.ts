import axios from 'axios';

// Empty means same-origin /api, proxied to the backend by next.config.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export interface Job {
  id: string;
  source: string;
  sourceId: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salaryMin?: number;
  salaryMax?: number;
  description?: string;
  url?: string;
  postedAt?: string;
}

export interface JobSourceInfo {
  id: string;
  name: string;
  enabled: boolean;
  docs: string;
}

export interface SearchResponse {
  jobs: Job[];
  total: number;
  sourcesSearched?: string[];
  errors?: string[];
}

export interface ParsedCV {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  summary?: string;
  experience: Array<{
    title: string;
    company: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    location?: string;
    graduationDate?: string;
    gpa?: string;
    grade?: string;
    highlights?: string[];
  }>;
  skills: string[];
  languages?: string[];
  certifications?: string[];
  projects?: Array<{
    name: string;
    description?: string;
    technologies?: string[];
  }>;
}

export interface BaseCV {
  id: string;
  fileName: string;
  originalFileName?: string;
  parsedData: ParsedCV;
  createdAt: string;
}

export interface Application {
  id: string;
  jobId?: string;
  baseCvId?: string;
  status: string;
  appliedAt?: string;
  appliedVia: string;
  notes?: string;
  job?: Job;
  baseCv?: { id: string; fileName: string };
}

export const jobApi = {
  search: async (params: { keywords: string; location?: string; remote?: boolean; sources?: string[] }) => {
    const { data } = await api.get('/jobs/search', { params });
    return data;
  },
  save: async (job: Omit<Job, 'id'>) => {
    const { data } = await api.post('/jobs/save', job);
    return data;
  },
  saved: async () => {
    const { data } = await api.get('/jobs/saved');
    return data;
  },
  deleteSaved: async (id: string) => {
    await api.delete(`/jobs/saved/${id}`);
  },
  sources: async (): Promise<{ sources: JobSourceInfo[] }> => {
    const { data } = await api.get('/jobs/sources');
    return data;
  }
};

export const cvApi = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/cv/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  },
  list: async () => {
    const { data } = await api.get('/cv');
    return data;
  },
  get: async (id: string) => {
    const { data } = await api.get(`/cv/${id}`);
    return data;
  },
  update: async (id: string, parsedData: ParsedCV) => {
    const { data } = await api.put(`/cv/${id}`, { parsedData });
    return data;
  },
  delete: async (id: string) => {
    await api.delete(`/cv/${id}`);
  },
  getFillData: async () => {
    const { data } = await api.get('/cv/fill-data');
    return data;
  }
};

export const aiApi = {
  tailor: async (baseCvId: string, jobDescription: string, jobId?: string) => {
    const { data } = await api.post('/ai/tailor', { baseCvId, jobDescription, jobId });
    return data;
  },
  coverLetter: async (baseCvId: string, jobDescription: string, company?: string) => {
    const { data } = await api.post('/ai/cover-letter', { baseCvId, jobDescription, company });
    return data;
  },
  matchScore: async (baseCvId: string, jobDescription: string) => {
    const { data } = await api.get('/ai/match-score', { params: { baseCvId, jobDescription } });
    return data;
  }
};

export const applicationApi = {
  create: async (params: { jobId?: string; baseCvId?: string; appliedVia?: string }) => {
    const { data } = await api.post('/applications', params);
    return data;
  },
  list: async (params?: { status?: string; appliedVia?: string }) => {
    const { data } = await api.get('/applications', { params });
    return data;
  },
  update: async (id: string, params: { status?: string; notes?: string }) => {
    const { data } = await api.patch(`/applications/${id}`, params);
    return data;
  },
  stats: async () => {
    const { data } = await api.get('/applications/stats');
    return data;
  }
};

export const authApi = {
  register: async (email: string, password: string) => {
    const { data } = await api.post('/auth/register', { email, password });
    return data;
  },
  login: async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },
  me: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  }
};

export interface TailoredCV {
  id: string;
  tailoredCV: ParsedCV;
  matchScore: number;
  createdAt: string;
}

export interface JobAlert {
  id: string;
  name: string;
  criteria: {
    keywords: string;
    location: string;
    remote: boolean;
  };
  frequency: 'daily' | 'weekly';
  active: boolean;
  lastSentAt: string | null;
  createdAt: string;
}

export const alertApi = {
  list: async () => {
    const { data } = await api.get('/alerts');
    return data;
  },
  create: async (alert: { name?: string; keywords: string; location?: string; remote?: boolean; frequency?: string }) => {
    const { data } = await api.post('/alerts', alert);
    return data;
  },
  update: async (id: string, params: { name?: string; frequency?: string; active?: boolean }) => {
    const { data } = await api.patch(`/alerts/${id}`, params);
    return data;
  },
  delete: async (id: string) => {
    await api.delete(`/alerts/${id}`);
  },
  test: async (id: string) => {
    const { data } = await api.post(`/alerts/${id}/test`);
    return data;
  }
};

export const exportApi = {
  toDocx: async (cvData: ParsedCV, filename?: string) => {
    const response = await api.post('/export/docx', { cvData, filename }, {
      responseType: 'blob'
    });
    return response.data;
  },
  toHtml: async (cvData: ParsedCV, filename?: string) => {
    const response = await api.post('/export/pdf', { cvData, filename }, {
      responseType: 'blob'
    });
    return response.data;
  },
  save: async (cvData: ParsedCV, baseCvId?: string, jobId?: string, format: 'docx' | 'html' = 'docx') => {
    const { data } = await api.post('/export/save', { cvData, baseCvId, jobId, format });
    return data;
  },
  history: async () => {
    const { data } = await api.get('/export/history');
    return data;
  }
};

export default api;