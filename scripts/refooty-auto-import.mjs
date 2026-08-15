import { createHash } from 'node:crypto';

const FIREBASE_DATABASE_URL = (process.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const FIREBASE_AUTH_TOKEN = process.env.FIREBASE_AUTH_TOKEN || '';
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const SITEMAP_URL = process.env.REFOOTY_SITEMAP_URL || 'https://refooty.com/sitemap-videos/1.xml';
const QUEUE_PATH = process.env.REFOOTY_QUEUE_PATH || 'automation/refootyHighlights';
const MAX_ITEMS = Number(process.env.REFOOTY_MAX_ITEMS || 10);
const LOOKBACK_DAYS = Number(process.env.REFOOTY_LOOKBACK_DAYS || 3);
const RIGHTS_CONFIRMED = String(process.env.REFOOTY_RIGHTS_CONFIRMED || '').toLowerCase() === 'true';
const DRY_RUN = String(process.env.REFOOTY_DRY_RUN || '').toLowerCase() === 'true';
const jsonHeaders = { 'Content-Type': 'application/json' };

function fail(message) { throw new Error(message); }
function htmlDecode(value) { return String(value || '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'"); }
function meta(html, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i');
  return htmlDecode((html.match(pattern) || html.match(reverse))?.[1] || '').trim();
}
function jsonLd(html) {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
    try { const parsed = JSON.parse(match[1].trim()); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return []; }
  });
}
function absolute(value, base) { try { return new URL(value, base).toString(); } catch { return ''; } }
function sourceKey(url) { return new URL(url).pathname.split('/').filter(Boolean).pop() || createHash('sha1').update(url).digest('hex').slice(0, 12); }
async function firebaseRequest(path, options = {}) {
  if (!FIREBASE_DATABASE_URL) fail('FIREBASE_DATABASE_URL is required');
  const headers = { ...jsonHeaders };
  if (FIREBASE_AUTH_TOKEN) headers.Authorization = `Bearer ${FIREBASE_AUTH_TOKEN}`;
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    const service = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    if (service.access_token) headers.Authorization = `Bearer ${service.access_token}`;
  }
  const response = await fetch(`${FIREBASE_DATABASE_URL}/${path.replace(/^\//, '')}.json`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) fail(`Firebase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
async function extractHighlight(pageUrl, sitemapLastmod) {
  const response = await fetch(pageUrl, { headers: { 'User-Agent': 'Sports803-ReFooty-AutoImporter/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`page ${response.status}`);
  const html = await response.text();
  const data = jsonLd(html).find(item => item && (item.contentUrl || item.embedUrl)) || {};
  const title = meta(html, 'og:title') || data.name || (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
  const description = meta(html, 'description') || data.description || '';
  const thumbnailUrl = absolute(meta(html, 'og:image') || data.thumbnailUrl, pageUrl);
  const mediaUrl = absolute(data.contentUrl || [...html.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)].map(match => match[1]).find(value => /\.m3u8(?:\?|$)/i.test(value)) || '', pageUrl);
  if (!title || !description || !thumbnailUrl || !mediaUrl) throw new Error(`incomplete metadata title=${!!title} description=${!!description} thumbnail=${!!thumbnailUrl} media=${!!mediaUrl}`);
  if (!/^https:\/\/(?:img\.)?refooty\.com\//i.test(mediaUrl)) throw new Error('media source is not hosted on refooty.com');
  const key = sourceKey(pageUrl);
  const now = Date.now();
  return { id: `refooty_${key}`, source: 'refooty', sourceUrl: pageUrl, importedAt: now, publishAt: now, rightsConfirmed: true, status: 'pending', title, description, thumbnailUrl, mediaUrl, eventDate: data.uploadDate || sitemapLastmod || '', updatedAt: now };
}
async function main() {
  if (!RIGHTS_CONFIRMED) fail('REFOOTY_RIGHTS_CONFIRMED=true is required before automatic third-party republishing is enabled.');
  const sitemapResponse = await fetch(SITEMAP_URL, { headers: { 'User-Agent': 'Sports803-ReFooty-AutoImporter/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!sitemapResponse.ok) fail(`sitemap ${sitemapResponse.status}`);
  const sitemap = await sitemapResponse.text();
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;
  const entries = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/gi)]
    .map(match => ({ url: match[1].trim(), lastmod: Date.parse(match[2]) }))
    .filter(entry => /^https:\/\/refooty\.com\/video\//i.test(entry.url) && (!Number.isFinite(entry.lastmod) || entry.lastmod >= cutoff))
    .slice(0, Math.max(0, MAX_ITEMS));
  const existing = DRY_RUN ? {} : ((await firebaseRequest(QUEUE_PATH)) || {});
  const results = [];
  for (const entry of entries) {
    const key = sourceKey(entry.url);
    if (existing[key]?.status === 'posted' || existing[key]?.status === 'pending') { results.push({ key, skipped: existing[key].status }); continue; }
    try {
      const record = await extractHighlight(entry.url, Number.isFinite(entry.lastmod) ? new Date(entry.lastmod).toISOString() : '');
      if (!DRY_RUN) await firebaseRequest(`${QUEUE_PATH}/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(record) });
      results.push({ key, queued: !DRY_RUN, title: record.title, sourceUrl: record.sourceUrl });
    } catch (error) {
      results.push({ key, skipped: 'error', error: error.message });
    }
  }
  console.log(JSON.stringify({ sitemap: SITEMAP_URL, discovered: entries.length, dryRun: DRY_RUN, results }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
