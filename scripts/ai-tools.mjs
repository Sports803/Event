#!/usr/bin/env node
import fs from 'node:fs/promises';

const enabled = String(process.env.AI_ENABLED || '').toLowerCase() === 'true';
const apiUrl = (process.env.AI_API_URL || '').replace(/\/$/, '');
const apiKey = process.env.AI_API_KEY || '';
const model = process.env.AI_MODEL || 'gpt-5-mini';

function requireAI() {
  if (!enabled) throw new Error('AI tools are disabled. Set AI_ENABLED=true to enable them.');
  if (!apiUrl || !apiKey) throw new Error('AI tools require AI_API_URL and AI_API_KEY.');
}

async function callAI(system, user, schema) {
  requireAI();
  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

const matchSchema = {
  name: 'event_match_intelligence',
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      sameEvent: { type: 'boolean' }, confidence: { type: 'number' }, teamConfidence: { type: 'number' },
      leagueConfidence: { type: 'number' }, timeConfidence: { type: 'number' }, reason: { type: 'string' }
    }, required: ['sameEvent', 'confidence', 'teamConfidence', 'leagueConfidence', 'timeConfidence', 'reason']
  }
};
const contentSchema = {
  name: 'event_content',
  schema: {
    type: 'object', additionalProperties: false,
    properties: { seoTitle: { type: 'string' }, metaDescription: { type: 'string' }, socialCopy: { type: 'string' }, faq: { type: 'array', items: { type: 'string' } } },
    required: ['seoTitle', 'metaDescription', 'socialCopy', 'faq']
  }
};
const repairSchema = {
  name: 'event_repair_suggestion',
  schema: {
    type: 'object', additionalProperties: false,
    properties: { changes: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' }, needsConfirmation: { type: 'boolean' }, reason: { type: 'string' } },
    required: ['changes', 'confidence', 'needsConfirmation', 'reason']
  }
};

export async function compareEvents(left, right) {
  return callAI('Compare two sports events. Do not invent facts. Use only supplied fields.', JSON.stringify({ left, right }), matchSchema);
}
export async function generateContent(event) {
  return callAI('Generate concise SEO and social content from the supplied event only. Do not invent facts.', JSON.stringify(event), contentSchema);
}
export async function suggestRepair(event) {
  return callAI('Inspect this event for inconsistent or missing fields. Suggest changes only; never apply them automatically.', JSON.stringify(event), repairSchema);
}

if (process.argv[1] && process.argv[1].endsWith('ai-tools.mjs')) {
  const [command, inputPath] = process.argv.slice(2);
  if (!command || !inputPath) throw new Error('Usage: node scripts/ai-tools.mjs <compare|content|repair> <json-file>');
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const result = command === 'content' ? await generateContent(input) : command === 'repair' ? await suggestRepair(input) : await compareEvents(input.left, input.right);
  process.stdout.write(JSON.stringify(result, null, 2));
}

export { callAI };
