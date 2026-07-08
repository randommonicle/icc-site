# Machine layout and cross-machine sync - ICC Platform

The ICC platform is developed on **two machines with different local layouts**. Git
(`randommonicle/icc-site`) is the only thing that syncs between them. Read this before assuming
any absolute path in a doc, memory, or script.

## Where this repo lives

| Machine | User | Path |
|---------|------|------|
| Work | `ben` | `C:\Users\ben\Projects\icc-site` (after the 2026-07-08 consolidation; was `C:\Users\ben\icc-site`) |
| Home | `bengr` | `C:\Users\bengr\OneDrive\Desktop\icc-site` (inside OneDrive-synced Desktop) |

On 2026-07-08 the **work** machine consolidated all projects under `C:\Users\ben\Projects\`.
The **home** machine layout is unchanged. (D-014: the repo may be renamed `icc-site` to
`icc-platform` when convenient; if so, update both machines' paths and the Claude memory keys.)

## What syncs and what does not

- **Syncs via git:** all tracked code and committed docs, including this file.
- **Does NOT sync** (local, per-path): the `.claude/projects/<key>/memory/` dirs, `.claude.json`,
  the gitignored `.env` (holds the real `NETLIFY_SITE_ID` + `NETLIFY_TOKEN`), and `node_modules`.
  The ICC client deliverables and brand assets live loose in the work machine's `Downloads`, not
  in the repo.

## Guidance for whichever Claude picks this up

1. **Never copy an absolute path between machines.** Discover the local repo root and work
   relative to it. `NEXT_SESSION.md` already carries a stale `C:\Users\bengr\OneDrive\Desktop\icc-site`
   citation from the home machine; that is expected drift, not a live path on the work machine.
2. **Your Claude memory is local** and keyed to the local path; it does not travel with `git pull`.
3. **Deploys are location-independent** (Netlify builds from git; the build is fully relative:
   `npm --prefix site ...`, publish `site/dist`). The repo works from any path.
4. **After a move, hand-copy the gitignored `.env`** to the new location (it holds the Netlify
   secrets and does not travel via git), and re-run `npm install` (root and `site/`).
5. **Storage differs.** Home keeps this repo inside OneDrive (Desktop Known-Folder-Move); the work
   machine keeps it at a plain local path under `Projects\`.
