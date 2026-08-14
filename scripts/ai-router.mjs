import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const truthy = value => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
const numberEnv = (name, fallback) => Number.isFinite(Number(process.env[name])) ? Number(process.env[name]) : fallback;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const AI_CONFIG = {
  enabled: truthy(process.env.AI_ENABLED),
  apiKey: process.env.NVIDIA_API_KEY || process.env.AI_API_KEY || '',
  apiBaseUrl: (process.env.NVIDIA_API_URL || process.env.AI_API_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''),
  models: {
    matching: process.env.AI_MODEL_MATCHING || 'qwen/qwen3-next-80b-a3b-instruct',
    writing: process.env.AI_MODEL_WRITING || 'meta/llama-3.3-70b-instruct',
    fast: process.env.AI_MODEL_FAST || 'nvidia/nemotron-3-nano-30b-a3b',
    reasoning: process.env.AI_MODEL_REASONING || 'openai/gpt-oss-120b',
    embedding: process.env.AI_MODEL_EMBEDDING || 'nvidia/nemotron-3-embed-1b'
  },
  fallbacks: {
    matching: (process.env.AI_FALLBACK_MATCHING || 'nvidia/nemotron-3-nano-30b-a3b').split(',').map(x => x.trim()).filter(Boolean),
    writing: (process.env.AI_FALLBACK_WRITING || 'qwen/qwen3-next-80b-a3b-instruct,nvidia/nemotron-3-nano-30b-a3b').split(',').map(x => x.trim()).filter(Boolean),
    fast: (process.env.AI_FALLBACK_FAST || 'meta/llama-3.3-8b-instruct').split(',').map(x => x.trim()).filter(Boolean),
    reasoning: (process.env.AI_FALLBACK_REASONING || 'nvidia/nemotron-3-super-120b-a12b').split(',').map(x => x.trim()).filter(Boolean),
    embedding: (process.env.AI_FALLBACK_EMBEDDING || '').split(',').map(x => x.trim()).filter(Boolean)
  },
  maxConcurrency: Math.max(1, numberEnv('AI_MAX_CONCURRENCY', 2)),
  timeoutMs: Math.max(1000, numberEnv('AI_TIMEOUT_MS', 30000)),
  maxRetries: Math.max(0, numberEnv('AI_MAX_RETRIES', 2)),
  cacheEnabled: process.env.AI_CACHE_ENABLED === undefined ? true : truthy(process.env.AI_CACHE_ENABLED),
  cacheTtlHours: Math.max(1, numberEnv('AI_CACHE_TTL_HOURS', 168)),
  cacheFile: process.env.AI_CACHE_FILE || '.ai-cache.json',
  circuitEnabled: process.env.AI_CIRCUIT_BREAKER_ENABLED === undefined ? true : truthy(process.env.AI_CIRCUIT_BREAKER_ENABLED),
  circuitFailureThreshold: Math.max(1, numberEnv('AI_CIRCUIT_FAILURE_THRESHOLD', 5)),
  circuitResetMs: Math.max(1000, numberEnv('AI_CIRCUIT_RESET_MS', 60000)),
  maxRequestsPerRun: Math.max(0, numberEnv('AI_MAX_REQUESTS_PER_RUN', 50)),
  promptVersion: process.env.AI_PROMPT_VERSION || '1.0.0'
};

export class AIProvider {
  async generateText() { throw new Error('generateText not implemented'); }
  async generateStructured() { throw new Error('generateStructured not implemented'); }
  async embed() { throw new Error('embed not implemented'); }
}

export class NvidiaProvider extends AIProvider {
  constructor(config = AI_CONFIG, fetchImpl = fetch) {
    super();
    this.config = config;
    this.fetch = fetchImpl;
  }

  headers() {
    if (!this.config.apiKey) throw new Error('NVIDIA_API_KEY is not configured');
    return { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  async request(path, payload) {
    const response = await this.fetch(`${this.config.apiBaseUrl}${path}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(payload), signal: AbortSignal.timeout(this.config.timeoutMs)
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!response.ok) {
      const error = new Error(`NVIDIA ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
      error.status = response.status;
      error.retryAfter = Number(response.headers.get('retry-after') || 0);
      throw error;
    }
    return body;
  }

  async generateText({ model, messages, temperature = 0.2, maxTokens = 1200 }) {
    const body = await this.request('/chat/completions', { model, messages, temperature, max_tokens: maxTokens });
    return body?.choices?.[0]?.message?.content || '';
  }

  async generateStructured({ model, messages, schema, temperature = 0.1, maxTokens = 1200 }) {
    const schemaInstruction = `Return ONLY valid JSON matching this schema. Do not use Markdown fences. Schema: ${JSON.stringify(schema)}`;
    const content = await this.generateText({ model, messages: [...messages, { role: 'system', content: schemaInstruction }], temperature, maxTokens });
    return parseJson(content);
  }

  async embed({ model, input }) {
    const body = await this.request('/embeddings', { model, input });
    return body?.data?.[0]?.embedding || [];
  }
}

export function parseJson(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('AI response was not valid JSON');
  }
}

function isTransient(error) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(error?.status)) || /timeout|timed out|socket|fetch failed|connection/i.test(String(error?.message));
}

class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; this.waiters = []; }
  async run(fn) {
    if (this.active >= this.limit) await new Promise(resolve => this.waiters.push(resolve));
    this.active++;
    try { return await fn(); } finally { this.active--; this.waiters.shift()?.(); }
  }
}

class CircuitBreaker {
  constructor(config) { this.config = config; this.failures = 0; this.openedAt = 0; }
  canCall() {
    if (!this.config.circuitEnabled) return true;
    if (!this.openedAt) return true;
    if (Date.now() - this.openedAt >= this.config.circuitResetMs) return true;
    return false;
  }
  success() { this.failures = 0; this.openedAt = 0; }
  failure() {
    this.failures++;
    if (this.failures >= this.config.circuitFailureThreshold) this.openedAt = Date.now();
  }
}

export class AIRouter {
  constructor({ provider = new NvidiaProvider(), config = AI_CONFIG, cache = null } = {}) {
    this.provider = provider;
    this.config = config;
    this.cache = cache || new FileCache(config.cacheFile, config.cacheTtlHours * 3600_000);
    this.queue = new Semaphore(config.maxConcurrency);
    this.breaker = new CircuitBreaker(config);
    this.stats = { requests: 0, cacheHits: 0, cacheMisses: 0, failures: 0, fallbacks: 0, retries: 0, latencyMs: [] };
  }

  async call(task, input, operation, { cache = true } = {}) {
    if (!this.config.enabled || !this.config.apiKey) return { ok: false, skipped: true, reason: 'AI_DISABLED' };
    const key = hash({ task, modelRoles: this.config.models, version: this.config.promptVersion, input });
    if (cache && this.config.cacheEnabled) {
      const hit = await this.cache.get(key);
      if (hit !== undefined) { this.stats.cacheHits++; return { ok: true, cached: true, value: hit }; }
      this.stats.cacheMisses++;
    }
    if (this.config.maxRequestsPerRun && this.stats.requests >= this.config.maxRequestsPerRun) return { ok: false, skipped: true, reason: 'AI_BUDGET_EXHAUSTED' };
    if (!this.breaker.canCall()) return { ok: false, skipped: true, reason: 'AI_CIRCUIT_OPEN' };
    const roles = [this.config.models[task], ...(this.config.fallbacks[task] || [])].filter(Boolean);
    let lastError;
    for (let modelIndex = 0; modelIndex < roles.length; modelIndex++) {
      const model = roles[modelIndex];
      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        const started = Date.now();
        try {
          this.stats.requests++;
          const value = await this.queue.run(() => operation(model));
          this.stats.latencyMs.push(Date.now() - started);
          this.breaker.success();
          if (modelIndex > 0) this.stats.fallbacks++;
          if (cache && this.config.cacheEnabled) await this.cache.set(key, value);
          return { ok: true, value, model, attempts: attempt + 1, cached: false };
        } catch (error) {
          lastError = error; this.stats.failures++;
          if (!isTransient(error) || attempt >= this.config.maxRetries) break;
          this.stats.retries++;
          const retryAfter = Number(error.retryAfter || 0) * 1000;
          await sleep(Math.max(retryAfter, Math.min(10000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 250)));
        }
      }
      this.breaker.failure();
      if (!this.breaker.canCall()) break;
    }
    return { ok: false, error: lastError?.message || 'AI_UNAVAILABLE', reason: 'AI_UNAVAILABLE' };
  }

  async matchEvents(left, right) {
    const input = { left, right };
    const schema = { sameEvent: 'boolean', confidence: 'number 0..1', homeTeam: 'string', awayTeam: 'string', competition: 'string', reason: 'string' };
    return this.call('matching', input, model => this.provider.generateStructured({ model, schema, messages: [{ role: 'user', content: `Compare these sports events using only supplied facts. ${JSON.stringify(input)}` }] }));
  }

  async generateArticle(event) {
    const schema = { title: 'string', metaDescription: 'string', introduction: 'string', preview: 'string', howToWatch: 'string', faq: 'array', keywords: 'array', social: { telegram: 'string', whatsapp: 'string', x: 'string' } };
    return this.call('writing', event, model => this.provider.generateStructured({ model, schema, messages: [{ role: 'user', content: `Write SEO content only from these event facts. Never invent scores, injuries, lineups, venues, times, or broadcasters. ${JSON.stringify(event)}` }] }));
  }

  async classifySport(event) {
    return this.call('fast', event, model => this.provider.generateStructured({ model, schema: { sport: 'string', confidence: 'number 0..1' }, messages: [{ role: 'user', content: `Classify the sport using only this event data: ${JSON.stringify(event)}` }] }));
  }

  async repairEvent(event) {
    return this.call('reasoning', event, model => this.provider.generateStructured({ model, schema: { safeToRepair: 'boolean', changes: 'object', reason: 'string' }, messages: [{ role: 'user', content: `Suggest conservative repairs only for missing or malformed fields. Do not invent sports facts. ${JSON.stringify(event)}` }] }));
  }

  summary() {
    const avg = this.stats.latencyMs.length ? this.stats.latencyMs.reduce((a, b) => a + b, 0) / this.stats.latencyMs.length : 0;
    return { ...this.stats, avgLatencyMs: Math.round(avg), circuitOpen: !this.breaker.canCall() };
  }
}

export class FileCache {
  constructor(file, ttlMs) { this.file = file; this.ttlMs = ttlMs; this.memory = new Map(); this.loaded = false; }
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try { const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')); for (const [key, value] of Object.entries(parsed)) this.memory.set(key, value); } catch { /* cache is optional */ }
  }
  async get(key) {
    await this.load(); const item = this.memory.get(key);
    if (!item || Date.now() - item.createdAt > this.ttlMs) { this.memory.delete(key); return undefined; }
    return item.value;
  }
  async set(key, value) {
    await this.load(); this.memory.set(key, { createdAt: Date.now(), value });
    try { await fs.writeFile(this.file, JSON.stringify(Object.fromEntries(this.memory)), 'utf8'); } catch { /* cache failure must not break events */ }
  }
}

export function deterministicMatch(left, right) {
  const aliases = new Map([['manutd', 'manchesterunited'], ['manunited', 'manchesterunited'], ['mancity', 'manchestercity'], ['psg', 'parissaintgermain'], ['inter', 'intermilan'], ['atleti', 'atleticomadrid']]);
  const normalize = value => {
    const compact = String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|afc|sc|cf|club)\b/g, '').replace(/[^a-z0-9]/g, '');
    return aliases.get(compact) || compact;
  };
  const sameTeams = normalize(left?.homeName) === normalize(right?.homeName) && normalize(left?.awayName) === normalize(right?.awayName);
  const reverseTeams = normalize(left?.homeName) === normalize(right?.awayName) && normalize(left?.awayName) === normalize(right?.homeName);
  const delta = Math.abs(Number(left?.date || 0) - Number(right?.date || 0));
  return { sameEvent: (sameTeams || reverseTeams) && delta <= 3 * 3600_000, confidence: sameTeams && delta <= 3600_000 ? 1 : reverseTeams && delta <= 3 * 3600_000 ? 0.95 : 0 };
}

export default AIRouter;

if (import.meta.url === `file://${process.argv[1]}`) {
  const router = new AIRouter();
  console.log(JSON.stringify({ enabled: router.config.enabled, models: router.config.models, summary: router.summary() }, null, 2));
}

// Provider interface deliberately remains compatible with future OpenAI, Anthropic, Gemini, or local implementations.
