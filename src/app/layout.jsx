/**
 * @file src/app/layout.jsx
 * @description Root Next.js App Router layout for StartSlate configuring metadata and global styles.
 */

import './globals.css';

/**
 * Global Next.js document metadata for StartSlate.
 *
 * @type {import('next').Metadata}
 */
export const metadata = {
  title: {
    default: 'StartSlate — A clean slate for every new hire.',
    template: '%s | StartSlate',
  },
  description:
    'Multi-tenant B2B SaaS automating new-hire onboarding paperwork, RA 10173 compliant Government ID verification, and IT provisioning.',
};

/**
 * Root HTML layout wrapper for all StartSlate routes.
 *
 * @description Applies StartSlate Alabaster canvas (`bg-slate-50`) and Deep Slate Navy typography (`text-slate-900`).
 * @param {{ children: import('react').ReactNode }} props - Root layout properties.
 * @returns {import('react').ReactElement} HTML root element.
 * @throws {Error} Never throws under normal React rendering.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
