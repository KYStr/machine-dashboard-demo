/** Dependency-free static build + portable preview. No secrets or uploads. */
import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const getArg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const rawSiteUrl = getArg('--site-url') || process.env.SITE_URL || '';
let siteUrl = '';
if (rawSiteUrl) {
  const url = new URL(rawSiteUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('SITE_URL must be a public HTTP(S) URL with no credentials, query, or hash.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Public SITE_URL must use HTTPS.');
  siteUrl = url.href.endsWith('/') ? url.href : `${url.href}/`;
}
const xmlEscape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const directory of ['public', 'src', 'shared']) await cp(resolve(root, directory), directory === 'public' ? dist : resolve(dist, directory), { recursive: true });
const urls = [];
for (const page of ['index.html', 'about.html']) {
  let html = await readFile(resolve(root, 'public', page), 'utf8');
  const pageUrl = siteUrl ? new URL(page === 'index.html' ? './' : page, siteUrl).href : '';
  const title = html.match(/<title>(.*?)<\/title>/s)[1];
  const description = html.match(/<meta name="description" content="(.*?)"/s)[1];
  const schema = { '@context': 'https://schema.org', '@type': page === 'index.html' ? 'WebApplication' : 'AboutPage', name: title, description, inLanguage: 'zh-Hant', ...(pageUrl ? { url: pageUrl } : {}), ...(page === 'index.html' ? { applicationCategory: 'BusinessApplication', operatingSystem: 'Web', isAccessibleForFree: true } : {}) };
  const head = [
    pageUrl ? `<link rel="canonical" href="${xmlEscape(pageUrl)}">` : '<!-- Configure SITE_URL to enable canonical URLs and indexing. -->',
    '<meta property="og:type" content="website">', '<meta property="og:locale" content="zh_TW">',
    `<meta property="og:title" content="${xmlEscape(title)}">`, `<meta property="og:description" content="${xmlEscape(description)}">`,
    '<meta property="og:site_name" content="Machine Signal · 機台訊號即時看板">',
    ...(pageUrl ? [`<meta property="og:url" content="${xmlEscape(pageUrl)}">`, `<meta property="og:image" content="${xmlEscape(new URL('og-image.png', siteUrl).href)}">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">', '<meta property="og:image:alt" content="機台訊號即時看板，使用模擬資料的桌面版預覽">'] : []),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${xmlEscape(title)}">`, `<meta name="twitter:description" content="${xmlEscape(description)}">`,
    ...(pageUrl ? [`<meta name="twitter:image" content="${xmlEscape(new URL('og-image.png', siteUrl).href)}">`] : []),
    `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`,
  ].join('\n  ');
  html = html.replace('__ROBOTS__', siteUrl ? 'index,follow,max-image-preview:large' : 'noindex,follow').replace('<!-- SEO_HEAD -->', head);
  await writeFile(resolve(dist, page), html);
  if (pageUrl) urls.push(pageUrl);
}
await writeFile(resolve(dist, 'robots.txt'), siteUrl ? `User-agent: *\nAllow: /\nDisallow: ${new URL(siteUrl).pathname}api/\nSitemap: ${new URL('sitemap.xml', siteUrl).href}\n` : 'User-agent: *\nDisallow: /\n# Configure SITE_URL before publishing.\n');
await writeFile(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `\n  <url><loc>${xmlEscape(url)}</loc></url>`).join('')}\n</urlset>\n`);
await writeFile(resolve(dist, '.nojekyll'), '');
// Content-hashed cache names prevent old JS modules from surviving an update.
async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => entry.isDirectory() ? listFiles(resolve(dir, entry.name)) : [resolve(dir, entry.name)]))).flat();
}
const files = (await listFiles(dist)).filter(path => !['sw.js', '.nojekyll'].includes(relative(dist, path))).sort();
const hash = createHash('sha256');
for (const path of files) hash.update(await readFile(path));
const version = hash.digest('hex').slice(0, 12);
const precache = ['./', ...files.map(path => `./${relative(dist, path).replaceAll('\\', '/')}`)];
const sw = (await readFile(resolve(root, 'public/sw.js'), 'utf8')).replace('__BUILD_HASH__', version).replace('__PRECACHE_ASSETS__', JSON.stringify(precache));
await writeFile(resolve(dist, 'sw.js'), sw);
// Build an inspectable single HTML file. The source remains modular in the repo.
const moduleOrder = ['src/icons.js', 'shared/alerts.mjs', 'shared/simulator.mjs', 'src/data-client.js', 'src/charts.js', 'src/app.js'];
let bundle = '';
for (const file of moduleOrder) {
  const source = (await readFile(resolve(root, file), 'utf8')).replace(/^import\s+.*?;\s*$/gm, '').replace(/^export\s+/gm, '');
  bundle += `\n// ---- ${file} ----\n${source}\n`;
}
let standalone = await readFile(resolve(dist, 'index.html'), 'utf8');
const css = await readFile(resolve(root, 'src/styles.css'), 'utf8');
const iconSvg = await readFile(resolve(root, 'public/icons/icon.svg'));
standalone = standalone.replace(/<link rel="(?:manifest|apple-touch-icon|canonical)"[^>]*>/g, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${iconSvg.toString('base64')}">`)
  .replace('<link rel="stylesheet" href="./src/styles.css">', `<style>\n${css}\n</style>`)
  .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex,nofollow">')
  .replace('<script type="module" src="./src/app.js"></script>', () => `<script>window.__PORTABLE_DEMO__ = true;\n(() => {${bundle}\n})();</script>`);
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(resolve(root, 'artifacts/preview.html'), standalone);
console.log(`Built dist/ (${version}) and artifacts/preview.html`);
console.log(siteUrl ? `SEO public URL: ${siteUrl}` : 'Local preview: noindex. Set SITE_URL for public canonical URLs, sitemap and indexing.');
