/**
 * @file postcss.config.mjs
 * @description PostCSS plugin pipeline configuration for Tailwind CSS and Autoprefixer.
 */

/**
 * Creates the PostCSS configuration object for StartSlate stylesheets.
 *
 * @description Enables Tailwind CSS compilation and vendor-prefix normalization via Autoprefixer.
 * @param {void} _unused - No runtime arguments required.
 * @returns {{ plugins: Record<string, object> }} PostCSS plugin map.
 * @throws {Error} Never throws under static configuration evaluation.
 */
function createPostcssConfig(_unused) {
  return {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  };
}

export default createPostcssConfig();
