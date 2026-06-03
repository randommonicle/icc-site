// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` is the canonical production URL — used for <link rel="canonical"> and
// sitemap generation. It is a placeholder until the domain is chosen (D-013);
// update it the moment the real domain is registered.
export default defineConfig({
  site: 'https://www.intelligentcarpetcleaning.co.uk',
  integrations: [sitemap()],
});
