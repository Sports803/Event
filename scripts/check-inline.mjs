import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(source => source.includes('var Gen') || source.includes('UnifiedGenerator'));
if (!scripts.length) throw new Error('No application inline script found');
fs.writeFileSync('/tmp/sports803-event-inline.js', scripts.join('\n'));
console.log(`Extracted ${scripts.length} application script block(s).`);
