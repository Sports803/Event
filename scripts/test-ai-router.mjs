import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { AIRouter, FileCache, deterministicMatch } from './ai-router.mjs';

await Promise.all(['/tmp/sports803-ai-test-cache.json', '/tmp/sports803-ai-fallback-cache.json', '/tmp/sports803-ai-concurrency-cache.json'].map(file => fs.rm(file, { force: true })));

const baseConfig = {
  enabled: true,
  apiKey: 'test-key',
  apiBaseUrl: 'https://example.invalid/v1',
  models: { matching: 'primary', writing: 'writer', fast: 'fast', reasoning: 'reasoner', embedding: 'embed' },
  fallbacks: { matching: ['fallback'], writing: ['writer-fallback'], fast: ['fast-fallback'], reasoning: ['reasoner-fallback'], embedding: [] },
  maxConcurrency: 2, timeoutMs: 1000, maxRetries: 1, cacheEnabled: true, cacheTtlHours: 24, cacheFile: '/tmp/sports803-ai-test-cache.json',
  circuitEnabled: true, circuitFailureThreshold: 2, circuitResetMs: 1000, maxRequestsPerRun: 50, promptVersion: 'test'
};

class FakeProvider {
  constructor() { this.calls = []; this.failPrimary = false; this.delay = 5; }
  async generateStructured({ model }) {
    this.calls.push(model);
    await new Promise(resolve => setTimeout(resolve, this.delay));
    if (model === 'primary' && this.failPrimary) { const error = new Error('503'); error.status = 503; throw error; }
    return { sameEvent: true, confidence: 0.99, homeTeam: 'Arsenal', awayTeam: 'Manchester United', competition: 'Premier League', reason: 'test' };
  }
}

const left = { homeName: 'Manchester United', awayName: 'Arsenal', date: Date.parse('2026-08-14T19:00:00Z') };
const right = { homeName: 'Man Utd', awayName: 'Arsenal', date: Date.parse('2026-08-14T19:30:00Z') };
assert.equal(deterministicMatch(left, right).sameEvent, true, 'deterministic alias matching');

const provider = new FakeProvider();
const router = new AIRouter({ provider, config: baseConfig, cache: new FileCache('/tmp/sports803-ai-test-cache.json', 86400000) });
const aiLeft = { ...left, homeName: 'Arsenal', awayName: 'Manchester United', date: Date.parse('2026-08-14T19:00:00Z') };
const aiRight = { ...right, homeName: 'Gunners', awayName: 'Man Utd', date: Date.parse('2026-08-14T23:30:00Z') };
const first = await router.matchEvents(aiLeft, aiRight);
assert.equal(first.ok, true, 'primary structured request succeeds');
const second = await router.matchEvents(aiLeft, aiRight);
assert.equal(second.cached, true, 'identical request is cached');
assert.equal(provider.calls.length, 1, 'cache prevents a second provider request');

const fallbackProvider = new FakeProvider();
fallbackProvider.failPrimary = true;
const fallbackRouter = new AIRouter({ provider: fallbackProvider, config: { ...baseConfig, cacheFile: '/tmp/sports803-ai-fallback-cache.json' }, cache: new FileCache('/tmp/sports803-ai-fallback-cache.json', 86400000) });
const fallback = await fallbackRouter.matchEvents(aiLeft, aiRight);
assert.equal(fallback.ok, true, 'fallback request succeeds');
assert.equal(fallback.model, 'fallback', 'fallback model selected after transient primary failure');
assert.ok(fallbackRouter.summary().retries >= 1, 'transient failure retried');

const parallelProvider = new FakeProvider();
let active = 0; let maxActive = 0;
parallelProvider.generateStructured = async ({ model }) => {
  active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 20)); active--;
  return { sameEvent: true, confidence: 0.9, homeTeam: 'A', awayTeam: 'B', competition: 'Test', reason: model };
};
const parallelRouter = new AIRouter({ provider: parallelProvider, config: { ...baseConfig, maxConcurrency: 2, cacheFile: '/tmp/sports803-ai-concurrency-cache.json' }, cache: new FileCache('/tmp/sports803-ai-concurrency-cache.json', 86400000) });
await Promise.all(Array.from({ length: 6 }, (_, index) => parallelRouter.matchEvents({ id: index, homeName: `Team ${index}`, awayName: `Opponent ${index}`, date: 1000 }, { id: index + 1, homeName: `Different ${index}`, awayName: `Other ${index}`, date: 999999999 })));
assert.ok(maxActive <= 2, 'concurrency limit respected');

console.log(JSON.stringify({
  passed: true,
  deterministicMatch: true,
  cacheHit: true,
  fallback: true,
  concurrencyMax: maxActive,
  summary: fallbackRouter.summary()
}, null, 2));
