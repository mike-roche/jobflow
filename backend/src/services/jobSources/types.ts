export interface NormalizedJob {
  source: string;
  sourceId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  salary?: string;
  url: string;
  postedAt: Date | null;
  remote: boolean;
}

export interface SearchQuery {
  keywords: string;
  location: string;
  remote: boolean;
}

export interface JobSource {
  id: string;
  name: string;
  docs: string;
  // False when the source needs credentials that aren't configured
  isEnabled: () => boolean;
  // Throws on network/API failure so callers can report which source failed
  search: (query: SearchQuery) => Promise<NormalizedJob[]>;
}
