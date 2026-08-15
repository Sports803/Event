import { createHash } from 'node:crypto';

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const FIREBASE_AUTH_TOKEN = process.env.FIREBASE_AUTH_TOKEN;
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const QUEUE_PATH = process.env.REFOOTY_QUEUE_PATH || 'automation/refootyHighlights';
const jsonHeaders = { 'Content-Type': 'application/json' };

function fail(message) { throw new Error(message); }
function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : ''; }
function esc(value) { return String(value || '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'"); }
function meta(html, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i');
  return esc((html.match(pattern) || html.match(reverse))?.[1] || '').trim();
}
function jsonLd(html) {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
    try { const parsed = JSON.parse(match[1].trim()); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return []; }
  });
}
function absolute(value, base) { try { return new URL(value, base).toString(); } catch { return ''; } }
function slugFromUrl(url) { return new URL(url).pathname.split('/').filter(Boolean).pop() || createHash('sha1').update(url).digest('hex').slice(0, 12); }
async function firebaseRequest(path, options = {}) {
  if (!FIREBASE_DATABASE_URL) fail('FIREBASE_DATABASE_URL is required');
  const url = `${FIREBASE_DATABASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}.json`;
  const headers = { ...jsonHeaders };
  if (FIREBASE_AUTH_TOKEN) headers.Authorization = `Bearer ${FIREBASE_AUTH_TOKEN}`;
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    const service = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    if (service.access_token) headers.Authorization = `Bearer ${service.access_token}`;
  }
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) fail(`Firebase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
async function main() {
  const url = arg('--url') || process.argv.find(value => value.startsWith('http'));
  if (!url) fail('Usage: node scripts/refooty-import.mjs --url https://refooty.com/video/... --rights-confirmed');
  if (!process.argv.includes('--rights-confirmed')) fail('Refusing to queue third-party video without --rights-confirmed. Confirm you have permission to republish it.');
  const pageUrl = new URL(url);
  if (pageUrl.hostname !== 'refooty.com' && !pageUrl.hostname.endsWith('.refooty.com')) fail('Only refooty.com URLs are accepted.');
  const response = await fetch(pageUrl, { headers: { 'User-Agent': 'Sports803-ReFooty-Importer/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) fail(`ReFooty page ${response.status}`);
  const html = await response.text();
  const data = jsonLd(html).find(item => item && (item.contentUrl || item.embedUrl)) || {};
  const title = meta(html, 'og:title') || data.name || (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
  const description = meta(html, 'description') || data.description || '';
  const thumbnail = absolute(meta(html, 'og:image') || data.thumbnailUrl, pageUrl);
  const mediaUrl = absolute(data.contentUrl || [...html.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)].map(match => match[1]).find(value => /\.m3u8(?:\?|$)/i.test(value)) || '', pageUrl);
  if (!title || !description || !thumbnail || !mediaUrl) fail(`Missing metadata: title=${!!title}, description=${!!description}, thumbnail=${!!thumbnail}, media=${!!mediaUrl}`);
  if (!/^https:\/\/(?:img\.)?refooty\.com\//i.test(mediaUrl)) fail('The extracted media source is not hosted on refooty.com.');
  const now = Date.now();
  const key = slugFromUrl(pageUrl.toString()).replace(/[^a-z0-9_-]/gi, '-');
  const record = {
    id: `refooty_${key}`,
    source: 'refooty', sourceUrl: pageUrl.toString(), importedAt: now, publishAt: now,
    rightsConfirmed: true, status: 'pending', title, description, thumbnailUrl: thumbnail, mediaUrl,
    eventDate: data.uploadDate || '', updatedAt: now
  };
  await firebaseRequest(`${QUEUE_PATH}/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(record) });
  console.log(JSON.stringify({ queued: true, key, title, thumbnailUrl: thumbnail, mediaUrl, queuePath: `${QUEUE_PATH}/${key}` }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
