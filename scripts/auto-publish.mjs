import { chromium } from 'playwright';

const BLOG_ID = process.env.BLOGGER_BLOG_ID;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const IMGBB_KEY = process.env.IMGBB_KEY;
const FIREBASE_URL = (process.env.FIREBASE_DATABASE_URL || '').replace(/^http:\/\//i, 'https://').replace(/\/$/, '');
const FIREBASE_AUTH_TOKEN = process.env.FIREBASE_AUTH_TOKEN || '';
const MAX_POSTS = Number(process.env.MAX_POSTS_PER_RUN || 5);
const WINDOW_HOURS = Number(process.env.EVENT_WINDOW_HOURS || 24);
const ACTIVE_GRACE_HOURS = Number(process.env.ACTIVE_GRACE_HOURS || 2);

for (const [name, value] of Object.entries({ BLOGGER_BLOG_ID: BLOG_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, IMGBB_KEY, FIREBASE_DATABASE_URL: FIREBASE_URL })) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

const jsonHeaders = { 'Content-Type': 'application/json' };
const firebaseUrl = (path = '') => `${FIREBASE_URL}/${path.replace(/^\//, '')}.json${FIREBASE_AUTH_TOKEN ? `?auth=${encodeURIComponent(FIREBASE_AUTH_TOKEN)}` : ''}`;

async function firebaseRequest(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(firebaseUrl(path), { ...options, headers: { ...jsonHeaders, ...(options.headers || {}) } });
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
        const playerBase = document.getElementById('cp-player').value || 'https://sports803.github.io/player/';
        const playerUrl = `${playerBase}?${match.streams.map(s => `mora=${encodeURIComponent(s.url)}`).join('&')}`;
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
function hasOneBall(match) { return (match.sources || []).includes('oneball') || (match.rawMatches || []).some(m => m._source === 'oneball'); }
function inWindow(match, now) { const time = Number(match.date || 0); return time >= now - ACTIVE_GRACE_HOURS * 3600000 && time <= now + WINDOW_HOURS * 3600000; }

async function main() {
  const now = Date.now();
  const matches = (await collectMatches()).filter(m => hasOneBall(m) && inWindow(m, now) && (m.streams || []).length);
  if (MAX_POSTS === 0) {
    console.log(JSON.stringify({ mode: 'detection-only', detected: matches.length, titles: matches.map(m => m.title) }));
    return;
  }
  const existing = (await firebaseRequest('automation/bloggerPosts')) || {};
  const eligible = matches.filter(m => existing[stableKey(m)]?.status !== 'posted').sort((a, b) => Number(a.date) - Number(b.date));
  const selected = eligible.slice(0, MAX_POSTS);
  const accessToken = selected.length ? await getBloggerToken() : null;
  let posted = 0;
  for (const match of selected) {
    const key = stableKey(match);
    const payload = {
      kickoff: new Date(match.date).toISOString(), sport: match.category === 'football' ? 'football' : 'other', isRacing: false,
      homeName: match.homeName || 'Home', homeLogo: match.homeLogo || '', awayName: match.awayName || '', awayLogo: match.awayLogo || '',
      score: '- -', scoreHome: '', scoreAway: '', statusType: match.isLive ? 'STATUS_LIVE' : 'STATUS_SCHEDULED', leagueName: match.league || 'Live Event',
      postUrl: '', channelKey: '', channelName: '', venue: '', updatedAt: Date.now(), duration: 120, category: match.category || 'other',
      channels: match.streams.map(s => ({ label: s.label || 'Stream', src: s.url })), _source: 'unified-auto', _matchId: match.id, _oneball: true
    };
    await firebaseRequest(`automation/bloggerPosts/${key}`, { method: 'PUT', body: JSON.stringify({ status: 'firebase_synced', matchId: match.id, kickoff: match.date, title: match.title, updatedAt: Date.now() }) });
    const eventKey = `unified_auto_${key}`;
    await firebaseRequest(eventKey, { method: 'PUT', body: JSON.stringify(payload) });
    try {
      const post = await bloggerInsert(accessToken, await buildPostData(match));
      await firebaseRequest(`automation/bloggerPosts/${key}`, { method: 'PUT', body: JSON.stringify({ status: 'posted', matchId: match.id, bloggerPostId: post.id, bloggerUrl: post.url || '', kickoff: match.date, title: match.title, updatedAt: Date.now() }) });
      posted++;
      console.log(`Posted ${match.title} (${post.id})`);
    } catch (error) {
      await firebaseRequest(`automation/bloggerPosts/${key}`, { method: 'PUT', body: JSON.stringify({ status: 'blogger_failed', matchId: match.id, error: String(error.message), kickoff: match.date, title: match.title, updatedAt: Date.now() }) });
      console.error(`Failed ${match.title}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ detected: matches.length, eligible: eligible.length, selected: selected.length, posted, skippedByRateLimit: Math.max(0, eligible.length - selected.length) }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
