// Builds prompts.json from lists.txt plus country prompts from the shared
// country data. Run: node build.mjs
import fs from 'node:fs';
import { norm } from './match.js';

const out = [];
const add = (q, groups) => {
  const seen = new Set();
  const a = [];
  for (const g of groups) {
    const names = g.map((x) => x.trim()).filter(Boolean);
    const keys = names.map(norm).filter((k) => k && !seen.has(k));
    if (!keys.length || seen.has(norm(names[0]))) continue;
    keys.forEach((k) => seen.add(k));
    a.push([names[0], ...names.slice(1)]);
  }
  out.push({ q, a });
};

for (const line of fs.readFileSync(new URL('./lists.txt', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [q, rest] = line.split(' | ');
  add(q.trim(), rest.split(',').map((x) => x.split('/')));
}

const countries = JSON.parse(fs.readFileSync(new URL('../daily/data/countries.json', import.meta.url), 'utf8'))
  .filter((c) => c.cont !== 'Antarctica' && !c.cont.startsWith('Seven'))
  .sort((a, b) => b.pop - a.pop);
const cs = (filter) => countries.filter(filter).map((c) => [c.name, ...(c.alt || [])]);
add('Name a country in Europe', cs((c) => c.cont === 'Europe'));
add('Name a country in Africa', cs((c) => c.cont === 'Africa'));
add('Name a country in Asia', cs((c) => c.cont === 'Asia'));
add('Name a country in the Americas', cs((c) => c.cont === 'North America' || c.cont === 'South America'));
add('Name any country', cs(() => true));

fs.writeFileSync(new URL('./prompts.json', import.meta.url), JSON.stringify(out));
console.log(out.length, 'prompts;', out.map((p) => p.a.length).join(' '));
