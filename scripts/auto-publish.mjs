import { chromium } from 'playwright';
import { createSign } from 'node:crypto';

const BLOG_ID = process.env.BLOGGER_BLOG_ID;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const IMGBB_KEY = process.env.IMGBB_KEY;
const FIREBASE_URL = (process.env.FIREBASE_DATABASE_URL || '').replace(/^http:\/\//i, 'https://').replace(/\/$/, '');
const FIREBASE_AUTH_TOKEN = process.env.FIREBASE_AUTH_TOKEN || '';
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const FIREBASE_PUBLIC_WRITE = String(process.env.FIREBASE_PUBLIC_WRITE || '').toLowerCase() === 'true';
const MAX_POSTS = Number(process.env.MAX_POSTS_PER_RUN || 5);
const WINDOW_HOURS = Number(process.env.EVENT_WINDOW_HOURS || 24);
const ACTIVE_GRACE_HOURS = Number(process.env.ACTIVE_GRACE_HOURS || 2);

for (const [name, value] of Object.entries({ BLOGGER_BLOG_ID: BLOG_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, IMGBB_KEY, FIREBASE_DATABASE_URL: FIREBASE_URL })) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}
if (!FIREBASE_PUBLIC_WRITE && !FIREBASE_SERVICE_ACCOUNT_JSON && !FIREBASE_AUTH_TOKEN) {
  throw new Error('Missing Firebase authentication. Set FIREBASE_PUBLIC_WRITE, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_AUTH_TOKEN.');
}

const jsonHeaders = { 'Content-Type': 'application/json' };
const base64url = value => Buffer.from(value).toString('base64url');
let firebaseAccessToken;
let firebaseAccessTokenExpiry = 0;
async function getFirebaseToken() {
  if (FIREBASE_PUBLIC_WRITE) return '';
  if (FIREBASE_AUTH_TOKEN) return FIREBASE_AUTH_TOKEN;
  if (firebaseAccessToken && Date.now() < firebaseAccessTokenExpiry - 60000) return firebaseAccessToken;
  let serviceAccount;
  try { serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({ iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/firebase.database', aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
  const response = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Firebase service-account token failed: ${JSON.stringify(data)}`);
  firebaseAccessToken = data.access_token;
  firebaseAccessTokenExpiry = Date.now() + Number(data.expires_in || 3600) * 1000;
  return firebaseAccessToken;
}
const firebaseUrl = (path = '') => `${FIREBASE_URL}/${path.replace(/^\//, '')}.json`;
async function firebaseRequest(path, options = {}) {

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const authToken = await getFirebaseToken();
      const headers = { ...jsonHeaders, ...(options.headers || {}) };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const response = await fetch(firebaseUrl(path), { ...options, headers });
      if (!response.ok) throw new Error(`Firebase ${response.status}: ${await response.text()}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw new Error(`Firebase request failed after retries: ${lastError?.message || lastError}`);
}

async function getBloggerToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function bloggerInsert(accessToken, postData) {
  const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts`, {
    method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(postData)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Blogger ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function uploadThumbnail(dataUrl) {
  const [meta, encoded] = dataUrl.split(',');
  const buffer = Buffer.from(encoded, 'base64');
  const form = new FormData();
  form.append('key', IMGBB_KEY);
  form.append('image', new Blob([buffer], { type: meta.match(/data:([^;]+)/)?.[1] || 'image/png' }), 'thumbnail.png');
  const response = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`ImgBB upload failed: ${JSON.stringify(data)}`);
  return data.data.url;
}

async function collectMatches() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(`file://${process.cwd()}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => UnifiedGenerator.fetchAllSources());
    await page.waitForFunction(() => !UnifiedGenerator._isFetching, null, { timeout: 120000 });
    return await page.evaluate(() => UnifiedGenerator._unifiedMatches || []);
  } finally {
    await browser.close();
  }
}

async function buildPostData(match) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(`file://${process.cwd()}/index.html`, { waitUntil: 'domcontentloaded' });
    const draft = await page.evaluate(async ({ match, blogId, imgbbKey }) => {
      Compose._settings.blogId = blogId;
      Compose._settings.imgbbKey = imgbbKey;
      const isRacing = match.category === 'motorsport' || match.category === 'cycling' || match.category === 'golf' || !match.awayName;
      const title = isRacing ? `${match.homeName} — ${match.league || 'Live'}` : `${match.homeName} vs ${match.awayName} — ${match.league || 'Live'}`;
      const dateStr = match.date ? new Date(match.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
      const timeStr = match.date ? new Date(match.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'TBD';
      document.getElementById('cp-title').value = title;
      document.getElementById('cp-league').value = match.league || 'Live';
      document.getElementById('cp-datetime').value = `${dateStr} ${timeStr}`;
      document.getElementById('cp-home-logo').value = match.homeLogo || '';
      document.getElementById('cp-away-logo').value = match.awayLogo || '';
      document.getElementById('cp-labels').value = `sports, ${match.category || 'live'}, ${(match.league || 'live').toLowerCase()}`;
      let body = isRacing ? `<h2>${Compose.esc(match.homeName)}</h2>\n` : `<h2>${Compose.esc(match.homeName)} vs ${Compose.esc(match.awayName)}</h2>\n`;
      body += `<p><strong>League:</strong> ${Compose.esc(match.league || 'Live')}<br/><strong>Date:</strong> ${Compose.esc(dateStr)} at ${Compose.esc(timeStr)}</p>\n`;
      body += isRacing ? '<p>Watch it live here.</p>\n' : '<p>Watch the live match here.</p>\n';
      if (match.streams?.length) {
        const rawStreams = match.streams.map(s => s.streamUrl || resolveRawStreamUrl(s)).filter(url => /^https?:\/\//i.test(url));
        if (!rawStreams.length) throw new Error('No valid raw stream URL available for Blogger iframe');
        const playerBase = document.getElementById('cp-player').value || 'https://sports803.github.io/player/';
        const playerUrl = `${playerBase}?mora=${encodeURIComponent(rawStreams[0])}`;
        if (playerUrl.includes('undefined') || playerUrl.includes('null')) throw new Error('Invalid Blogger player URL');
        body += `<iframe src="${Compose.esc(playerUrl)}" allow="encrypted-media" allowfullscreen sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation" loading="lazy" scrolling="no" style="width:100%;height:480px;border:0;background:#000;"></iframe>\n`;
      }
      document.getElementById('cp-body').value = body;
      Compose.renderThumbnail();
      for (let i = 0; i < 30 && !Compose._cachedThumbnail; i++) await new Promise(r => setTimeout(r, 300));
      if (!Compose._cachedThumbnail) throw new Error('Thumbnail generation timed out');
      const templates = ['preview', 'howtowatch', 'h2h', 'faq', 'cta', 'highlights'];
      templates.forEach(t => Compose.insertTemplate(t));
      return {
        title: document.getElementById('cp-title').value.trim(),
        body: document.getElementById('cp-body').value.trim(),
        labels: document.getElementById('cp-labels').value.split(',').map(x => x.trim()).filter(Boolean),
        customMetaData: document.getElementById('cp-meta-desc').value.trim(),
        thumbnail: Compose._cachedThumbnail
      };
    }, { match, blogId: BLOG_ID, imgbbKey: IMGBB_KEY });
    const thumbnailUrl = await uploadThumbnail(draft.thumbnail);
    return {
      title: draft.title,
      content: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #f1f2f6;"><img src="${thumbnailUrl}" style="max-width: 100%; height: auto; margin-bottom: 20px;" /><h2>${escapeHtml(draft.title)}</h2><div>${draft.body.replaceAll('\n', '<br />')}</div></div>`,
      labels: draft.labels,
      status: 'LIVE',
      ...(draft.customMetaData ? { customMetaData: draft.customMetaData } : {})
    };
  } finally {
    await browser.close();
  }
}

function escapeHtml(value) { return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function stableKey(match) { return `${String(match.homeName).toLowerCase()}|${String(match.awayName).toLowerCase()}|${new Date(match.date).toISOString().slice(0, 16)}`.replace(/[^a-z0-9|:-]+/g, '-'); }
function validateFirebaseEvent(event) {
  const required = ['id', 'kickoff', 'homeName', 'awayName', 'statusType', 'channels', 'updatedAt'];
  const missing = required.filter(field => event[field] === undefined || event[field] === null);
  const invalidChannels = Array.isArray(event.channels) ? event.channels.filter(channel => !/^https:\/\/sports803\.github\.io\/player\/\?mora=.+/i.test(String(channel?.src || '')) || String(channel?.src || '').includes('mora=undefined')) : [];
  if (missing.length || !Array.isArray(event.channels) || !event.channels.length || invalidChannels.length) {
    throw new Error(`Firebase event schema invalid: missing=${missing.join(',') || 'none'}, channels=${Array.isArray(event.channels) ? event.channels.length : 'invalid'}, invalidPlayerUrls=${invalidChannels.length}`);
  }
  return true;
}
async function writeAndVerifyFirebaseEvent(eventKey, event) {
  validateFirebaseEvent(event);
  const path = `s803config/todaysMatches/${eventKey}`;
  console.log(`[FIREBASE] Writing event: ${eventKey}`);
  await firebaseRequest(path, { method: 'PUT', body: JSON.stringify(event) });
  console.log('[FIREBASE] PUT successful');
  const readBack = await firebaseRequest(path);
  validateFirebaseEvent(readBack || {});
  if (readBack.id !== event.id || readBack._matchId !== event._matchId) throw new Error(`[FIREBASE] Read-back mismatch at ${path}`);
  console.log('[FIREBASE] Read-back successful');
  console.log('[FIREBASE] Website-compatible event confirmed');
  return readBack;
}
async function patchAndVerifyFirebaseEvent(eventKey, patch) {
  const path = `s803config/todaysMatches/${eventKey}`;
  await firebaseRequest(path, { method: 'PATCH', body: JSON.stringify(patch) });
  const readBack = await firebaseRequest(path);
  for (const [field, value] of Object.entries(patch)) {
    if (String(readBack?.[field] ?? '') !== String(value ?? '')) throw new Error(`[FIREBASE] Patch read-back mismatch: ${path}/${field}`);
  }
  console.log(`[FIREBASE] Update verified: ${eventKey}`);
  return readBack;
}
const PLAYER_BASE = 'https://sports803.github.io/player/';
function resolveRawStreamUrl(stream) {
  const candidate = String(stream?.streamUrl || stream?.url || stream?.src || '').trim();
  if (!candidate || candidate === 'undefined' || candidate === 'null') return '';
  try {
    const parsed = new URL(candidate);
    if (parsed.hostname === 'sports803.github.io' && parsed.pathname === '/player/') return parsed.searchParams.get('mora') || '';
  } catch { /* validate as raw URL below */ }
  return candidate;
}
function makePlayerUrl(rawUrl) {
  return `${PLAYER_BASE}?mora=${encodeURIComponent(rawUrl)}`;
}
function normalizeStreams(streams) {
  const seen = new Set();
  return (Array.isArray(streams) ? streams : []).map((stream, index) => {
    const streamUrl = resolveRawStreamUrl(stream);
    return {
      label: String(stream?.label || `Server ${index + 1}`).trim(),
      src: streamUrl ? makePlayerUrl(streamUrl) : '',
      streamUrl,
      health: 'UNKNOWN',
      status: 'unknown'
    };
  }).filter(stream => /^https?:\/\//i.test(stream.streamUrl) && !seen.has(stream.streamUrl) && seen.add(stream.streamUrl));
}
async function probeStream(stream) {
  try {
    const response = await fetch(stream.streamUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    return { ...stream, health: response.ok ? 'ONLINE' : 'OFFLINE', status: response.ok ? 'online' : 'offline', httpStatus: response.status };
  } catch {
    return { ...stream, health: 'UNKNOWN', status: 'unknown' };
  }
}
async function rankStreams(streams) {
  const probed = await Promise.all(streams.map(probeStream));
  const rank = { ONLINE: 0, UNKNOWN: 1, OFFLINE: 2 };
  return probed.sort((a, b) => rank[a.health] - rank[b.health]).map((stream, index) => ({ ...stream, fallbackOrder: index + 1 }));
}
function deriveLifecycle(match, now) {
  const kickoff = Number(match.date || 0);
  const durationMs = Number(match.duration || 120) * 60000;
  if (match.isLive || (kickoff <= now && kickoff + durationMs > now)) return { statusType: 'STATUS_LIVE', status: 'LIVE' };
  if (kickoff + durationMs <= now) return { statusType: 'STATUS_FINAL', status: 'FINISHED' };
  if (kickoff <= now + 15 * 60000) return { statusType: 'STATUS_SCHEDULED', status: 'STARTING_SOON' };
  return { statusType: 'STATUS_SCHEDULED', status: 'UPCOMING' };
}
function hasOneBall(match) { return (match.sources || []).includes('oneball') || (match.rawMatches || []).some(m => m._source === 'oneball'); }
function inWindow(match, now) { const time = Number(match.date || 0); return time >= now - ACTIVE_GRACE_HOURS * 3600000 && time <= now + WINDOW_HOURS * 3600000; }
async function refreshExistingLifecycles(matches, now) {
  for (const match of matches) {
    const eventKey = `match_auto_${stableKey(match)}`;
    const path = `s803config/todaysMatches/${eventKey}`;
    const existing = await firebaseRequest(path);
    if (!existing || !existing.id) continue;
    const lifecycle = deriveLifecycle(match, now);
    await patchAndVerifyFirebaseEvent(eventKey, { statusType: lifecycle.statusType, status: lifecycle.status, updatedAt: Date.now() });
  }
}

async function main() {
  const now = Date.now();
  const matches = (await collectMatches()).map(match => ({ ...match, streams: normalizeStreams(match.streams) })).filter(m => hasOneBall(m) && inWindow(m, now) && m.streams.length);
  if (MAX_POSTS === 0) {
    console.log(JSON.stringify({ mode: 'detection-only', detected: matches.length, titles: matches.map(m => m.title) }));
    return;
  }
  await refreshExistingLifecycles(matches, now);
  const existing = (await firebaseRequest('automation/bloggerPosts')) || {};
  const eligible = matches.filter(m => existing[stableKey(m)]?.status !== 'posted').sort((a, b) => Number(a.date) - Number(b.date));
  const selected = eligible.slice(0, MAX_POSTS);
  const accessToken = selected.length ? await getBloggerToken() : null;
  let posted = 0;
  for (const match of selected) {
    const key = stableKey(match);
    const eventKey = `match_auto_${key}`;
    const lifecycle = deriveLifecycle(match, now);
    const rankedStreams = await rankStreams(match.streams);
    const firebasePayload = {
      id: eventKey,
      kickoff: new Date(match.date).toISOString(), sport: match.category === 'football' ? 'football' : 'other', category: match.category || 'other', isRacing: !match.awayName,
      homeName: match.homeName || 'Home', homeLogo: match.homeLogo || '', awayName: match.awayName || '', awayLogo: match.awayLogo || '',
      score: '- -', scoreHome: '', scoreAway: '', minute: null, period: null, scoreProvider: 'none', statusType: lifecycle.statusType, status: lifecycle.status,
      leagueName: match.league || 'Live Event', leagueId: match.leagueId || '', leagueEmoji: match.leagueEmoji || '',
      postUrl: '', bloggerPostId: '', publicationStatus: 'FIREBASE_SYNCED', matchId: match.id, source: 'oneball',
      channelKey: '', channelName: '', venue: '', updatedAt: Date.now(), duration: 120,
      channels: rankedStreams, streamCount: rankedStreams.length, fallbackEnabled: rankedStreams.length > 1,
      _source: 'unified-auto', _matchId: match.id, _oneball: true, _automation: true
    };
    await writeAndVerifyFirebaseEvent(eventKey, firebasePayload);
    await firebaseRequest(`automation/bloggerPosts/${key}`, { method: 'PUT', body: JSON.stringify({ status: 'firebase_synced', eventKey, matchId: match.id, kickoff: match.date, title: match.title, updatedAt: Date.now() }) });
    try {
      const post = await bloggerInsert(accessToken, await buildPostData(match));
      const publishedAt = Date.now();
      await patchAndVerifyFirebaseEvent(eventKey, { postUrl: post.url || '', bloggerPostId: post.id, publicationStatus: 'PUBLISHED', publishedAt, updatedAt: publishedAt });
      await firebaseRequest(`automation/bloggerPosts/${key}`, { method: 'PUT', body: JSON.stringify({ status: 'posted', eventKey, matchId: match.id, bloggerPostId: post.id, bloggerUrl: post.url || '', kickoff: match.date, title: match.title, updatedAt: publishedAt }) });
      posted++;
      console.log(`Posted ${match.title} (${post.id}) and updated Firebase card ${eventKey}`);
    } catch (error) {
      const failedAt = Date.now();
      await patchAndVerifyFirebaseEvent(eventKey, { publicationStatus: 'BLOGGER_FAILED', publicationError: String(error.message), updatedAt: failedAt });
      await firebaseRequest(`automation/bloggerPosts/${key}`, { method: 'PUT', body: JSON.stringify({ status: 'blogger_failed', eventKey, matchId: match.id, error: String(error.message), kickoff: match.date, title: match.title, updatedAt: failedAt }) });
      console.error(`Failed ${match.title}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ detected: matches.length, eligible: eligible.length, selected: selected.length, posted, skippedByRateLimit: Math.max(0, eligible.length - selected.length) }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
