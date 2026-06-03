import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Care-guides content collection (D-006). Each guide is Markdown sourced from
// docs/TEXATHERM_KNOWLEDGE_BRIEF.md — the single verified knowledge source the
// site content and the AI assistant must both agree with. Keep claims here in
// line with that brief: attribute manufacturer figures, never assert
// "WoolSafe approved", and state only what we can defend (see L-009).
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(), // <h1> and document <title>
    description: z.string(), // meta description / OG
    summary: z.string(), // listing-card blurb
    order: z.number().default(50), // listing sort (low number = first)
    updated: z.string(), // ISO date, e.g. "2026-06-03"
    // Rendered visibly at the foot of the guide AND as FAQPage JSON-LD, so the
    // structured data always matches what the reader sees.
    faq: z
      .array(z.object({ question: z.string(), answer: z.string() }))
      .default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { guides };
