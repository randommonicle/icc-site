// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// <lastmod> for the content-collection pages, read from each entry's `updated`
// frontmatter (the same date the page shows as "Last updated"). Static pages get
// no lastmod at all: a lastmod stamped with the build date changes on every deploy
// and search engines learn to ignore it (SEO audit T-04, 14 Sept 2026).
function contentLastmod() {
  const map = new Map();
  for (const [dir, prefix] of [['guides', '/guides/'], ['areas', '/areas/']]) {
    const base = fileURLToPath(new URL(`./src/content/${dir}/`, import.meta.url));
    for (const file of fs.readdirSync(base)) {
      if (!file.endsWith('.md')) continue;
      const m = fs.readFileSync(path.join(base, file), 'utf8').match(/^updated:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
      if (m) map.set(`${prefix}${file.slice(0, -3)}/`, m[1]);
    }
  }
  return map;
}
const lastmodByPath = contentLastmod();

// `site` is the canonical production URL — used for <link rel="canonical"> and
// sitemap generation. It is a placeholder until the domain is chosen (D-013);
// update it the moment the real domain is registered.
export default defineConfig({
  site: 'https://www.intelligentclean.co.uk',
  // Directory-style output (/about/index.html) means the canonical URL of every
  // page ends in a slash. Declaring it makes the dev server, the sitemap and the
  // link form agree, and every internal href is written with the slash so no
  // click is a 301 hop (SEO audit T-03, 14 Sept 2026; test/internal-links.test.js).
  trailingSlash: 'always',
  // /booking-action is a token-authorised operator utility page (D-027), not public
  // content — keep it out of the sitemap (it is also noindex/no-referrer in its head).
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/booking-action'),
      serialize: (item) => {
        const lastmod = lastmodByPath.get(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
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
