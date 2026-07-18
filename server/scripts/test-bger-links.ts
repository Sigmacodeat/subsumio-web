// Quick test to find BGER decision link patterns
export {};
const res = await fetch('https://www.bger.ch/index/juridiction/jurisdiction-inherit-template/jurisdiction-recht/jurisdiction-recht-urteile2000.htm', {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)' },
  signal: AbortSignal.timeout(15000),
});
const html = await res.text();
console.log('HTML length:', html.length);

// Find all href links
const allLinks = [...html.matchAll(/href="([^"]+\.htm[^"]*)"/gi)];
console.log('All .htm links:', allLinks.length);
for (const l of allLinks.slice(0, 10)) console.log('  ', l[1]);

// Find links that look like decision details
const detailLinks = [...html.matchAll(/href="([^"]*(?:detail|urteil|entscheid)[^"]*\.htm[^"]*)"/gi)];
console.log('\nDecision links:', detailLinks.length);
for (const l of detailLinks.slice(0, 5)) console.log('  ', l[1]);

// Check for JavaScript-based navigation
const jsLinks = html.match(/window\.location|onclick|javascript:/gi);
console.log('\nJS navigation:', jsLinks ? jsLinks.length : 0);

// Check for form-based search
const forms = html.match(/<form[^>]*action="([^"]*)"[^>]*>/gi);
console.log('\nForms:', forms ? forms.length : 0);
if (forms) for (const f of forms.slice(0, 3)) console.log('  ', f);

// Check the RSS page
const rssRes = await fetch('https://search.bger.ch/home/juridiction/feed-rss.html', {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)' },
  signal: AbortSignal.timeout(15000),
});
const rssHtml = await rssRes.text();
console.log('\nRSS page length:', rssHtml.length);
const rssLinks = [...rssHtml.matchAll(/href="([^"]*(?:rss|feed|xml)[^"]*)"/gi)];
console.log('RSS feed links:', rssLinks.length);
for (const l of rssLinks.slice(0, 10)) console.log('  ', l[1]);
