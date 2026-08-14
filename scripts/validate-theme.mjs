import { readFile } from 'node:fs/promises';

const file = process.argv[2] || 'sports803-theme.xml';
const source = await readFile(file, 'utf8');
const required = [
  ['Blogger skin', /<b:skin\b[\s\S]*<\/b:skin>/],
  ['body closing tag', /<\/body>/],
  ['HTML closing tag', /<\/html>/],
  ['Firebase URL variable', /firebase-url/],
  ['Events section', /id=['"]events-tab['"]/],
  ['Live TV section', /id=['"]livetv-tab['"]/],
  ['Search input', /id=['"]searchInput['"]/],
  ['Mobile navigation', /bottom-nav|mobile-nav/i],
];

const failures = required.filter(([, pattern]) => !pattern.test(source)).map(([name]) => `Missing ${name}`);
if (/FIREBASE_PUBLIC_WRITE/i.test(source)) failures.push('Theme must not contain FIREBASE_PUBLIC_WRITE configuration.');
if (source.includes('\u0000')) failures.push('Theme contains a null character.');

const cdataOpen = (source.match(/<!\[CDATA\[/g) || []).length;
const cdataClose = (source.match(/\]\]>/g) || []).length;
if (cdataOpen !== cdataClose) failures.push(`CDATA delimiters are unbalanced (${cdataOpen} open, ${cdataClose} close).`);

if (failures.length) {
  console.error(`Theme validation failed for ${file}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Theme validation passed for ${file}.`);
console.log(`Bytes: ${Buffer.byteLength(source, 'utf8')}; CDATA blocks: ${cdataOpen}.`);
