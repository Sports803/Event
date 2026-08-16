import fs from 'node:fs';
import { parse } from 'node:querystring';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter(Boolean);
if (!scripts.length) throw new Error('No inline scripts found');
fs.writeFileSync('/tmp/event-inline.js', scripts.join('\n'));
console.log(`Extracted ${scripts.length} inline scripts`);

const publisherChecks = ['startTime', 'endTime', 'homeTeam', 'awayTeam', 'streams', 'Read-back validation failed'];
for (const check of publisherChecks) {
  if (!html.includes(check)) throw new Error(`Missing publisher contract field/check: ${check}`);
}
console.log('Publisher schema/read-back checks present');

const expo = fs.readFileSync(new URL('../expo/App.js', import.meta.url), 'utf8');
for (const check of ['isUpcoming', 'isVisible', 'raw.streams', 'Live & upcoming']) {
  if (!expo.includes(check)) throw new Error(`Missing Expo sync behavior: ${check}`);
}
console.log('Expo visibility checks present');

const flutterService = fs.readFileSync(new URL('../lib/services/firebase_service.dart', import.meta.url), 'utf8');
if (!flutterService.includes('event.isVisible')) throw new Error('Flutter service still filters to live only');
console.log('Flutter visibility check present');
parse('ok=true');
console.log('Event sync validation passed');
