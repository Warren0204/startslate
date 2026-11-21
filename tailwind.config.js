/**
 * @file tailwind.config.js
 * @description Tailwind CSS configuration for StartSlate brand tokens and shadcn/ui semantic variables.
 */

import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Builds the StartSlate Tailwind CSS theme configuration object.
 *
 * @description Configures content globs, StartSlate color tokens (#0F172A, #10B981, #F8FAFC), and shadcn/ui CSS variable mappings.
 * @param {void} _unused - No runtime arguments required.
 * @returns {import('tailwindcss').Config} Resolved Tailwind CSS configuration.
 * @throws {Error} Never throws under static configuration evaluation.
 */
function createTailwindConfig(_unused) {
  return {
    darkMode: ['class'],
    content: [
      './src/app/**/*.{js,jsx}',
      './src/components/**/*.{js,jsx}',
    ],
    theme: {
      container: {
        center: true,
        padding: '2rem',
        screens: {
          '2xl': '1400px',
        },
      },
      extend: {
        colors: {
          navy: '#0F172A',
          emeraldAccent: '#10B981',
          alabaster: '#F8FAFC',
          border: 'hsl(var(--border))',
          input: 'hsl(var(--input))',
          ring: 'hsl(var(--ring))',
          background: 'hsl(var(--background))',
          foreground: 'hsl(var(--foreground))',
          primary: {
            DEFAULT: 'hsl(var(--primary))',
            foreground: 'hsl(var(--primary-foreground))',
          },
          secondary: {
            DEFAULT: 'hsl(var(--secondary))',
            foreground: 'hsl(var(--secondary-foreground))',
          },
          destructive: {
            DEFAULT: 'hsl(var(--destructive))',
            foreground: 'hsl(var(--destructive-foreground))',
          },
          muted: {
            DEFAULT: 'hsl(var(--muted))',
            foreground: 'hsl(var(--muted-foreground))',
          },
          accent: {
            DEFAULT: 'hsl(var(--accent))',
            foreground: 'hsl(var(--accent-foreground))',
          },
          popover: {
            DEFAULT: 'hsl(var(--popover))',
            foreground: 'hsl(var(--popover-foreground))',
          },
          card: {
            DEFAULT: 'hsl(var(--card))',
            foreground: 'hsl(var(--card-foreground))',
          },
        },
        borderRadius: {
          lg: 'var(--radius)',
          md: 'calc(var(--radius) - 2px)',
          sm: 'calc(var(--radius) - 4px)',
        },
      },
    },
    plugins: [tailwindcssAnimate],
  };
}

export default createTailwindConfig();
