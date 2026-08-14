#!/usr/bin/env node
const FIREBASE_URL = (process.env.FIREBASE_DATABASE_URL || '').replace(/^http:\/\//i, 'https://').replace(/\/$/, '');
const AUTH_TOKEN = process.env.FIREBASE_AUTH_TOKEN || '';
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';

const base64url = value => Buffer.from(value).toString('base64url');
let cachedToken;
let tokenExpiry = 0;
async function getToken() {
  if (AUTH_TOKEN) return AUTH_TOKEN;
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  if (!SERVICE_ACCOUNT_JSON) return '';
  const account = JSON.parse(SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.database', aud: account.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const { createSign } = await import('node:crypto');
  const signer = createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(account.private_key, 'base64url')}`;
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Firebase token failed: ${response.status}`);
  cachedToken = data.access_token; tokenExpiry = Date.now() + Number(data.expires_in || 3600) * 1000; return cachedToken;
}
async function read(path) {
  const token = await getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${FIREBASE_URL}/${path}.json`, { headers });
  if (!response.ok) throw new Error(`Firebase ${response.status}: ${await response.text()}`);
  return response.json();
}
function validate(key, event) {
  const required = ['id', 'kickoff', 'homeName', 'awayName', 'statusType', 'channels', 'updatedAt'];
  const missing = required.filter(field => event?.[field] === undefined || event?.[field] === null);
  const channels = Array.isArray(event?.channels) ? event.channels.filter(channel => /^https?:\/\//i.test(String(channel?.src || ''))) : [];
  return { key, valid: missing.length === 0 && channels.length > 0, missing, streamCount: channels.length, publicationStatus: event?.publicationStatus || 'UNKNOWN' };
}
const events = await read('s803config/todaysMatches');
const report = Object.entries(events || {}).map(([key, event]) => validate(key, event));
const invalid = report.filter(item => !item.valid);
console.log(JSON.stringify({ path: 's803config/todaysMatches', total: report.length, valid: report.length - invalid.length, invalid: invalid.length, invalidEvents: invalid.slice(0, 50) }, null, 2));
if (invalid.length) process.exitCode = 2;
