// One-off diagnostic — inspect the captured DHA detail HTML for selectors
// we can use to extract estimated_value and description.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const file = process.argv[2] || path.resolve(
  __dirname,
  '..',
  '.bonfire-session/capture/detail-https-dhantx-bonfirehub-com-opportunities-229849.html'
);
const html = fs.readFileSync(file, 'utf8');
const $ = cheerio.load(html);
const text = $('body').text().replace(/\s+/g, ' ');

console.log('Length:', html.length);

console.log('\n--- dollar matches (first 10) ---');
const dollars = [...text.matchAll(/\$[\d,]+(\.\d{2})?/g)];
dollars.slice(0, 10).forEach((m) => console.log(' ', m[0]));

const labels = [
  'estimated value', 'estimated budget', 'contract value', 'budget',
  'award amount', 'maximum amount', 'estimated amount',
  'project value', 'total value',
];
console.log('\n--- known value labels ---');
labels.forEach((l) => {
  const re = new RegExp('([^.]{0,50}' + l + '[^.]{0,80})', 'i');
  const m = text.match(re);
  if (m) console.log(`  "${l}":`, m[1].slice(0, 130));
});

console.log('\n--- ch-description (first 800 chars) ---');
console.log($('.ch-description').text().slice(0, 800).replace(/\s+/g, ' '));

console.log('\n--- distinct data-testid (first 30) ---');
const seen = new Set();
$('[data-testid]').each((_, el) => {
  const id = $(el).attr('data-testid');
  if (!seen.has(id)) seen.add(id);
});
[...seen].slice(0, 30).forEach((id) => console.log(' ', id));
console.log(`(${seen.size} unique)`);

console.log('\n--- promising classes (value/budget/amount/estim/summary/spec/info) ---');
const classes = new Set();
$('*[class]').each((_, el) => {
  const cl = $(el).attr('class');
  cl.split(/\s+/).forEach((c) => {
    if (/value|budget|amount|estim|summary|spec|info|metadata|attribute|field/i.test(c)) {
      classes.add(c);
    }
  });
});
[...classes].slice(0, 40).forEach((c) => console.log(' ', c));

console.log('\n--- definition-list pairs (dt -> dd) ---');
$('dl').each((i, dl) => {
  $(dl).find('dt').each((j, dt) => {
    const label = $(dt).text().trim();
    const value = $(dt).next('dd').text().trim().slice(0, 80);
    if (label) console.log(`  ${label} -> ${value}`);
  });
});

console.log('\n--- table label/value pairs ---');
$('table tr').each((_, tr) => {
  const tds = $(tr).find('th,td');
  if (tds.length === 2) {
    const k = $(tds[0]).text().trim();
    const v = $(tds[1]).text().trim().slice(0, 80);
    if (k.length < 60 && v.length > 0) console.log(`  ${k} | ${v}`);
  }
});
