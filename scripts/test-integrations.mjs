import assert from 'node:assert/strict';

process.env.BLOGGER_BLOG_ID = 'test-blog';
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh';
process.env.IMGBB_KEY = 'test-imgbb';
process.env.FIREBASE_DATABASE_URL = 'https://example.firebaseio.com';
process.env.FIREBASE_PUBLIC_WRITE = 'true';
process.env.SPORTMONKS_API_TOKEN = 'test-sportmonks-token';

const originalFetch = globalThis.fetch;
const uploadedUrl = 'https://i.ibb.co/test/sports803-thumbnail.jpg';
const imageDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAABAAD/2w==';
let calls = [];

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).includes('api.imgbb.com/1/upload')) {
    return new Response(JSON.stringify({ success: true, data: { url: uploadedUrl, display_url: uploadedUrl } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (String(url).includes('/api/v3/football/fixtures/search/')) {
    return new Response(JSON.stringify({ data: [{ id: 987654, name: 'Arsenal vs Chelsea', starting_at: '2026-08-21 18:00:00', starting_at_timestamp: Math.floor(Date.parse('2026-08-21T18:00:00Z') / 1000), league_id: 'eng.1', participants: [{ name: 'Arsenal', meta: { location: 'home' } }, { name: 'Chelsea', meta: { location: 'away' } }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected test fetch: ${url}`);
};

try {
  const helpers = await import('./auto-publish.mjs');
  const parsed = helpers.parseImageDataUri(imageDataUri);
  const pastedParsed = helpers.parseImageDataUri(imageDataUri.slice(1));
  assert.equal(parsed.mimeType, 'image/jpeg');
  assert.equal(pastedParsed.mimeType, 'image/jpeg');
  assert.ok(parsed.buffer.length > 0);
  assert.equal(parsed.filename, 'sports803-thumbnail.jpeg');

  const html = await helpers.replaceInlineImages(`<p>Preview</p><img src="${imageDataUri}" />`);
  assert.ok(html.includes(uploadedUrl));
  assert.ok(!html.includes('data:image/'));
  assert.equal(calls.filter(call => call.url.includes('api.imgbb.com/1/upload')).length, 1);

  assert.equal(helpers.normalizeTeamName('FC Páris Saint-Germain'), 'paris saint germain');
  const fixture = await helpers.lookupDirectSportmonks({ homeName: 'Arsenal', awayName: 'Chelsea', date: Date.parse('2026-08-21T18:00:00Z') });
  assert.deepEqual(fixture, { fixtureId: 987654, leagueId: 'eng.1', startingAt: '2026-08-21 18:00:00' });
  const sportmonksCall = calls.find(call => call.url.includes('/api/v3/football/fixtures/search/'));
  assert.equal(sportmonksCall.options.headers.Authorization, 'test-sportmonks-token');
  console.log('Integration helper tests passed: ImgBB data URI conversion, inline replacement, team normalization, and Sportmonks lookup.');
} finally {
  globalThis.fetch = originalFetch;
}
