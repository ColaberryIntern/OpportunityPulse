// Static sitemap content for public pages
const SITE_URL = 'https://opportunitypulse.com';

const publicRoutes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/login', priority: '0.8', changefreq: 'monthly' },
  { path: '/register', priority: '0.8', changefreq: 'monthly' },
  { path: '/browse', priority: '0.9', changefreq: 'daily' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
];

export function generateSitemap() {
  const urls = publicRoutes.map(route => `
  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
