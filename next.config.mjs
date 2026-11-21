/**
 * @file next.config.mjs
 * @description Next.js App Router configuration for StartSlate with strict HTTP security headers.
 */

/**
 * Builds the strict Content-Security-Policy header value for StartSlate.
 *
 * @description Constructs CSP directives permitting self-hosted assets and Supabase endpoints while blocking framing and object embeds.
 * @param {boolean} isDevelopment - Whether Next.js is running in non-production mode.
 * @returns {string} Serialized Content-Security-Policy directive string.
 * @throws {Error} Never throws under normal execution.
 */
function buildContentSecurityPolicy(isDevelopment) {
  const scriptSrc = isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self' https://*.supabase.co",
    "object-src 'none'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  ];

  if (!isDevelopment) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

/**
 * Generates global HTTP security headers applied to every Next.js route.
 *
 * @description Enforces clickjacking prevention, MIME-sniffing protection, strict referrer policy, HSTS, permissions policy, and CSP.
 * @param {void} _unused - Next.js invokes this hook with no parameters.
 * @returns {Promise<Array<{ source: string, headers: Array<{ key: string, value: string }> }>>} Next.js header rule definitions.
 * @throws {Error} Never throws under normal configuration evaluation.
 */
async function buildSecurityHeaders(_unused) {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(self), microphone=(), geolocation=(), browsing-topics=()',
        },
        {
          key: 'Content-Security-Policy',
          value: buildContentSecurityPolicy(isDevelopment),
        },
      ],
    },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pdf-lib'],
  headers: buildSecurityHeaders,
};

export default nextConfig;
