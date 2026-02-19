import { Helmet } from 'react-helmet-async';

function SEOHead({ title, description, path, type = 'website' }) {
  const siteName = 'Opportunity Pulse';
  const baseUrl = window.location.origin;
  const fullTitle = title ? `${title} | ${siteName}` : siteName;
  const fullUrl = path ? `${baseUrl}${path}` : baseUrl;
  const defaultDescription = 'AI-powered platform for discovering government contracts, AI jobs, and investment opportunities.';

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description || defaultDescription} />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description || defaultDescription} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description || defaultDescription} />
    </Helmet>
  );
}

export default SEOHead;
