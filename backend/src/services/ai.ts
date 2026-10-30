import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from 'dotenv';

config();

const CV_SCHEMA = {
  name: "parse_cv",
  description: "Parse a CV/resume and extract structured information",
  input: {
    type: "object",
    properties: {
      name: { type: "string", description: "Full name" },
      email: { type: "string", description: "Email address" },
      phone: { type: "string", description: "Phone number" },
      location: { type: "string", description: "City, Country" },
      summary: { type: "string", description: "Professional summary or objective" },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            description: { type: "string" }
          },
          required: ["title", "company", "description"]
        }
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree: { type: "string" },
            institution: { type: "string" },
            location: { type: "string" },
            graduationDate: { type: "string" },
            gpa: { type: "string" },
            grade: { type: "string" },
            highlights: { type: "array", items: { type: "string" } }
          },
          required: ["degree", "institution"]
        }
      },
      skills: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      certifications: { type: "array", items: { type: "string" } },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            technologies: { type: "array", items: { type: "string" } }
          }
        }
      },
      achievements: { type: "array", items: { type: "string" } }
    },
    required: ["name", "email", "experience", "education", "skills"]
  }
};

const TAILOR_CV_SCHEMA = {
  name: "tailor_cv",
  description: "Tailor a CV for a specific job description",
  input: {
    type: "object",
    properties: {
      name: { type: "string", description: "Full name" },
      email: { type: "string", description: "Email address" },
      phone: { type: "string", description: "Phone number" },
      location: { type: "string", description: "City, Country" },
      summary: { type: "string", description: "Professional summary tailored to the job" },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            description: { type: "string" }
          },
          required: ["title", "company", "description"]
        }
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree: { type: "string" },
            institution: { type: "string" },
            location: { type: "string" },
            graduationDate: { type: "string" },
            gpa: { type: "string" },
            grade: { type: "string" },
            highlights: { type: "array", items: { type: "string" } }
          },
          required: ["degree", "institution"]
        }
      },
      skills: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      certifications: { type: "array", items: { type: "string" } },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            technologies: { type: "array", items: { type: "string" } }
          }
        }
      },
      achievements: { type: "array", items: { type: "string" } }
    },
    required: ["name", "email", "experience", "education", "skills"]
  }
};

// Providers that don't support a setting ignore it
export interface AIRequestOptions {
  // How much reasoning to spend: 'low' for quick bulk scoring, default for writing
  effort?: 'low' | 'medium' | 'high';
}

interface AIProvider {
  complete(prompt: string, systemPrompt?: string, options?: AIRequestOptions): Promise<string>;
  completeWithJson<T>(systemPrompt: string, userPrompt: string, schema: any, options?: AIRequestOptions): Promise<T>;
}

class MiniMaxProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    if (!apiKey) throw new Error('MiniMax API key not provided');
    this.client = new Anthropic({
      apiKey,
      baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/anthropic'
    });
  }

  async complete(prompt: string, systemPrompt = 'You are a helpful assistant.'): Promise<string> {
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
    const response = await this.client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });
    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return '';
  }

  async completeWithJson<T>(systemPrompt: string, userPrompt: string, schema: any): Promise<T> {
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
    
    const response = await this.client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        {
          name: schema.name,
          description: schema.description,
          input_schema: schema.input
        }
      ],
      tool_choice: {
        type: 'tool',
        name: schema.name
      }
    });

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        return block.input as T;
      }
    }

    for (const block of response.content) {
      if (block.type === 'text') {
        try {
          return JSON.parse(block.text) as T;
        } catch {
          throw new Error(`Failed to parse JSON response: ${block.text}`);
        }
      }
    }

    throw new Error('No valid response from model');
  }
}

// Models that accept `fallbacks: 'default'`: if the model declines a request on safety grounds,
// the API re-runs it on a fallback model of its choosing within the same call
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);

class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    if (!apiKey) throw new Error('Anthropic API key not provided');
    this.client = new Anthropic({ apiKey });
  }

  private async create(
    params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'model' | 'max_tokens'>,
    options: AIRequestOptions = {}
  ): Promise<Anthropic.Beta.BetaMessage> {
    const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
    const useFallbacks = FALLBACK_MODELS.has(model);

    const response = await this.client.beta.messages.create({
      ...params,
      model,
      // Thinking is on by default and counts toward max_tokens
      max_tokens: 16000,
      ...(options.effort && { output_config: { effort: options.effort } }),
      ...(useFallbacks && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const })
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined this request');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('The model response was cut off (max_tokens)');
    }
    return response;
  }

  async complete(prompt: string, systemPrompt = 'You are a helpful assistant.', options?: AIRequestOptions): Promise<string> {
    const response = await this.create({ system: systemPrompt, messages: [{ role: 'user', content: prompt }] }, options);
    // Thinking blocks come before the answer, so collect the text blocks rather than reading content[0]
    return response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  async completeWithJson<T>(systemPrompt: string, userPrompt: string, schema: any, options?: AIRequestOptions): Promise<T> {
    const response = await this.create({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        {
          name: schema.name,
          description: schema.description,
          input_schema: schema.input
        }
      ],
      tool_choice: {
        type: 'tool',
        name: schema.name
      }
    }, options);

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        return block.input as T;
      }
    }

    throw new Error('No tool response from model');
  }
}

// Runs Claude Code in print mode (`claude -p`) so AI work uses the Claude Pro/Max subscription
// Claude Code is logged in with, instead of an API key. Each call is a one-shot, tool-less
// request: no file access, no MCP servers, no project settings, nothing saved to session history.
class ClaudeCodeProvider implements AIProvider {
  // An empty directory, so Claude Code never picks up a CLAUDE.md or project settings
  private workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobflow-claude-'));

  private run(systemPrompt: string, prompt: string, options: AIRequestOptions = {}, extraArgs: string[] = []): Promise<any> {
    const args = [
      '-p',
      '--output-format', 'json',
      '--system-prompt', systemPrompt,
      '--tools', '',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--setting-sources', '',
      '--max-turns', '5',
      ...(process.env.CLAUDE_CODE_MODEL ? ['--model', process.env.CLAUDE_CODE_MODEL] : []),
      ...(options.effort ? ['--effort', options.effort] : []),
      ...extraArgs
    ];

    // In print mode an API key in the environment always wins over the subscription login,
    // so strip any (JobFlow's .env may hold one for the API provider)
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    return new Promise((resolve, reject) => {
      const child = spawn(process.env.CLAUDE_CODE_PATH || 'claude', args, { cwd: this.workDir, env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGINT'), 5 * 60 * 1000);

      child.stdout.on('data', chunk => (stdout += chunk));
      child.stderr.on('data', chunk => (stderr += chunk));
      child.on('error', error => {
        clearTimeout(timer);
        reject(new Error(`Could not start Claude Code (${error.message}). Is it installed and on PATH?`));
      });
      child.on('close', code => {
        clearTimeout(timer);
        let result: any;
        try {
          result = JSON.parse(stdout);
        } catch {
          reject(new Error(stderr.trim() || `Claude Code exited with code ${code}`));
          return;
        }
        // Failures inside the run (not logged in, usage limit, ...) come back as an error result
        if (result.is_error) {
          reject(new Error(`Claude Code: ${result.result || result.subtype}`));
          return;
        }
        resolve(result);
      });

      // The prompt goes through stdin, so long CVs and descriptions don't hit argv limits
      child.stdin.end(prompt);
    });
  }

  async complete(prompt: string, systemPrompt = 'You are a helpful assistant.', options?: AIRequestOptions): Promise<string> {
    const result = await this.run(systemPrompt, prompt, options);
    return result.result || '';
  }

  async completeWithJson<T>(systemPrompt: string, userPrompt: string, schema: any, options?: AIRequestOptions): Promise<T> {
    const result = await this.run(systemPrompt, userPrompt, options, ['--json-schema', JSON.stringify(schema.input)]);
    if (!result.structured_output) {
      throw new Error('Claude Code returned no structured output');
    }
    return result.structured_output as T;
  }
}

class OpenAIProvider implements AIProvider {
  async complete(prompt: string, systemPrompt = 'You are a helpful assistant.'): Promise<string> {
    throw new Error('OpenAI provider does not support structured output');
  }

  async completeWithJson<T>(systemPrompt: string, userPrompt: string, schema: any): Promise<T> {
    throw new Error('OpenAI provider does not support structured output');
  }
}

class OpenRouterProvider implements AIProvider {
  async complete(prompt: string, systemPrompt = 'You are a helpful assistant.'): Promise<string> {
    throw new Error('OpenRouter provider does not support structured output');
  }

  async completeWithJson<T>(systemPrompt: string, userPrompt: string, schema: any): Promise<T> {
    throw new Error('OpenRouter provider does not support structured output');
  }
}

export type AIProviderType = 'openai' | 'anthropic' | 'minimax' | 'openrouter' | 'claude-code';

interface AIServiceConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  minimaxApiKey?: string;
  openrouterApiKey?: string;
  defaultProvider?: AIProviderType;
  // Used when the default provider fails, e.g. the subscription's usage limit is reached
  fallbackProvider?: AIProviderType;
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
    description: string;
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
  achievements?: string[];
}

export class AIService {
  private providers: Map<AIProviderType, AIProvider> = new Map();
  private defaultProvider: AIProviderType;
  private fallbackProvider?: AIProviderType;

  constructor(config: AIServiceConfig) {
    if (config.defaultProvider === 'claude-code' || config.fallbackProvider === 'claude-code') {
      this.providers.set('claude-code', new ClaudeCodeProvider());
    }
    if (config.openaiApiKey) {
      this.providers.set('openai', new OpenAIProvider());
    }
    if (config.anthropicApiKey) {
      this.providers.set('anthropic', new AnthropicProvider(config.anthropicApiKey));
    }
    if (config.minimaxApiKey) {
      this.providers.set('minimax', new MiniMaxProvider(config.minimaxApiKey));
    }
    if (config.openrouterApiKey) {
      this.providers.set('openrouter', new OpenRouterProvider());
    }

    this.defaultProvider = config.defaultProvider || 'anthropic';
    if (config.fallbackProvider && config.fallbackProvider !== this.defaultProvider && this.providers.has(config.fallbackProvider)) {
      this.fallbackProvider = config.fallbackProvider;
    }

    if (!this.providers.has(this.defaultProvider)) {
      throw new Error(`AI provider '${this.defaultProvider}' is not configured`);
    }
  }

  private async withFallback<T>(call: (provider: AIProvider) => Promise<T>): Promise<T> {
    try {
      return await call(this.getProvider());
    } catch (error) {
      if (!this.fallbackProvider) throw error;
      console.warn(`[ai] ${this.defaultProvider} failed (${(error as Error).message}); using ${this.fallbackProvider}`);
      return call(this.getProvider(this.fallbackProvider));
    }
  }

  private getProvider(type?: AIProviderType): AIProvider {
    const providerType = type || this.defaultProvider;
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Provider ${providerType} not configured`);
    }
    return provider;
  }

  async complete(prompt: string, systemPrompt?: string, options?: AIRequestOptions): Promise<string> {
    return this.withFallback(provider => provider.complete(prompt, systemPrompt, options));
  }

  async completeWithJson<T>(systemPrompt: string, userPrompt: string, schema: any, options?: AIRequestOptions): Promise<T> {
    return this.withFallback(provider => provider.completeWithJson<T>(systemPrompt, userPrompt, schema, options));
  }

  async parseCV(cvText: string): Promise<string> {
    const systemPrompt = `You are a professional resume parser. Extract ALL information from the resume and return it using the parse_cv tool. Extract EVERYTHING - do not omit any information. If a field is not found, use null or empty arrays.`;

    const userPrompt = `Extract structured information from this CV/resume:\n\n${cvText}`;

    const result = await this.completeWithJson<ParsedCV>(systemPrompt, userPrompt, CV_SCHEMA);
    return JSON.stringify(result);
  }

  async tailorCV(cvText: string, jobDescription: string): Promise<string> {
    const systemPrompt = `You are a professional resume writer. Tailor the resume to match the job description.
- Highlight relevant experience matching job requirements
- Include keywords from the job description
- Reorder experience to prioritize most relevant roles
- Keep the EXACT SAME structure with all fields
- Use the tailor_cv tool to return the result`;

    const userPrompt = `Original Resume (JSON):
${cvText}

Job Description:
${jobDescription}`;

    const result = await this.completeWithJson<ParsedCV>(systemPrompt, userPrompt, TAILOR_CV_SCHEMA);
    return JSON.stringify(result);
  }

  async generateCoverLetter(cvText: string, jobDescription: string, companyName: string): Promise<string> {
    const systemPrompt = `You are a professional cover letter writer. Generate a tailored cover letter that:
- Is 250-400 words
- Addresses the key requirements in the job description
- Highlights specific achievements from the resume relevant to the role
- Shows enthusiasm for the company and role
- Uses a professional but personable tone`;

    const userPrompt = `Resume:\n${cvText}\n\nJob Description:\n${jobDescription}\n\nCompany: ${companyName}`;
    return this.complete(userPrompt, systemPrompt);
  }

  async calculateMatchScore(cvText: string, jobDescription: string): Promise<number> {
    const systemPrompt = `You are an ATS optimization expert. Calculate how well a resume matches a job description.
Return ONLY a number between 0-100 representing the match percentage.
Consider:
- Keyword overlap
- Skills match
- Experience alignment
- Education requirements`;

    const userPrompt = `Resume:\n${cvText}\n\nJob Description:\n${jobDescription}`;
    const result = await this.complete(userPrompt, systemPrompt, { effort: 'low' });
    const match = result.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  // Quick relevance pass over many jobs at once, using only the listing basics (no description)
  async triageJobs(cvText: string, preferences: string, jobs: TriageJob[]): Promise<TriageResult[]> {
    const systemPrompt = `You screen job listings for one candidate. For each listing, judge how likely it is
to be a good fit worth applying to, using only the title, company, location and salary shown.
Score 0-100: 80+ strong fit, 60-79 plausible, below 60 unlikely. Weigh seniority, role type and the
candidate's stated preferences. Give a one-sentence reason. Return a result for every listing id.`;

    const userPrompt = `Candidate resume (JSON):
${cvText}

Candidate preferences: ${preferences || 'none stated'}

Listings (JSON):
${JSON.stringify(jobs)}`;

    const result = await this.completeWithJson<{ results: TriageResult[] }>(
      systemPrompt, userPrompt, TRIAGE_SCHEMA, { effort: 'low' }
    );
    return result.results || [];
  }
}

export interface TriageJob {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
}

export interface TriageResult {
  id: string;
  score: number;
  reason: string;
}

const TRIAGE_SCHEMA = {
  name: 'score_jobs',
  description: 'Record a fit score for each job listing',
  input: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The listing id, copied exactly' },
            score: { type: 'integer', description: 'Fit score 0-100' },
            reason: { type: 'string', description: 'One sentence explaining the score' }
          },
          required: ['id', 'score', 'reason']
        }
      }
    },
    required: ['results']
  }
};

let aiServiceInstance: AIService | null = null;

// .env.example ships placeholders like "sk-ant-..."; treat those as unset
function configuredKey(value: string | undefined): string | undefined {
  return value && !value.endsWith('...') ? value : undefined;
}

export function initAIService(): AIService {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIService({
      openaiApiKey: configuredKey(process.env.OPENAI_API_KEY),
      anthropicApiKey: configuredKey(process.env.ANTHROPIC_API_KEY),
      minimaxApiKey: configuredKey(process.env.MINIMAX_API_KEY),
      openrouterApiKey: configuredKey(process.env.OPENROUTER_API_KEY),
      defaultProvider: process.env.AI_PROVIDER as AIProviderType || 'anthropic',
      fallbackProvider: process.env.AI_FALLBACK_PROVIDER as AIProviderType || undefined
    });
  }
  return aiServiceInstance;
}

export function getAIService(): AIService {
  if (!aiServiceInstance) {
    return initAIService();
  }
  return aiServiceInstance;
}
