// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is the canonical production URL — used for <link rel="canonical"> and
// sitemap generation. It is a placeholder until the domain is chosen (D-013);
// update it the moment the real domain is registered.
export default defineConfig({
  site: 'https://www.intelligentclean.co.uk',
  // /booking-action is a token-authorised operator utility page (D-027), not public
  // content — keep it out of the sitemap (it is also noindex/no-referrer in its head).
  integrations: [sitemap({ filter: (page) => !page.includes('/booking-action') })],
  vite: {
    // shared/config/*.js are CommonJS (module.exports), consumed by the CJS
    // Netlify functions and the plain-Node test runner (D-006/D-007). Rollup
    // treats project .js as ESM by default, so extend its CommonJS transform to
    // reach them — that lets the Astro pages import the single pricing source
    // (services.astro / index.astro) instead of hardcoding figures.
    build: {
      commonjsOptions: { include: [/shared[\\/]config/, /node_modules/] },
    },
  },
});
