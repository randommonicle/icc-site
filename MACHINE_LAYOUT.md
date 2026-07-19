# Machine layout and cross-machine sync - ICC Platform

The ICC platform is developed on **two machines with different local layouts**. Git
(`randommonicle/icc-site`) is the only thing that syncs between them. Read this before assuming
any absolute path in a doc, memory, or script.

## Where this repo lives

| Machine | User | Path |
|---------|------|------|
| Work | `ben` | `C:\Users\ben\Projects\icc-site` (after the 2026-07-08 consolidation; was `C:\Users\ben\icc-site`) |
| Home | `bengr` | `C:\Users\bengr\Projects\ICC\icc-site` (after the 2026-07-19 consolidation; was `C:\Users\bengr\OneDrive\Desktop\icc-site`) |

On 2026-07-08 the **work** machine consolidated all projects under `C:\Users\ben\Projects\`.
The **home** machine followed, and by 2026-07-19 this repo sits at `C:\Users\bengr\Projects\ICC\icc-site`,
**outside OneDrive**. An empty `icc-site` folder may still linger on the home Desktop; it is a stub with
no git repo in it, not a second checkout. (D-014: the repo may be renamed `icc-site` to
`icc-platform` when convenient; if so, update both machines' paths and the Claude memory keys.)

## What syncs and what does not

- **Syncs via git:** all tracked code and committed docs, including this file.
- **Does NOT sync** (local, per-path): the `.claude/projects/<key>/memory/` dirs, `.claude.json`,
  the gitignored `.env` (holds the real `NETLIFY_SITE_ID` + `NETLIFY_TOKEN`), and `node_modules`.
  The ICC client deliverables and brand assets live outside the repo on both machines: loose in
  the work machine's `Downloads`, and under `C:\Users\bengr\Projects\ICC\deliverables\` at home
  (four `ICC-Progress-Update-for-Mark*` files were moved there out of the repo root on
  2026-07-19). Keep client documents out of the repo — it is public today (see CLAUDE.md).

## Guidance for whichever Claude picks this up

1. **Never copy an absolute path between machines.** Discover the local repo root and work
   relative to it. `NEXT_SESSION.md` carries dated `C:\Users\bengr\OneDrive\Desktop\icc-site`
   citations in its session history; those record where the repo sat at the time and are now
   stale on both machines. Treat any absolute path in a dated session note as history, not as a
   live location. This table is the only authoritative record of where the repo lives.
2. **Your Claude memory is local** and keyed to the local path; it does not travel with `git pull`.
3. **Deploys are location-independent** (Netlify builds from git; the build is fully relative:
   `npm --prefix site ...`, publish `site/dist`). The repo works from any path.
4. **After a move, hand-copy the gitignored `.env`** to the new location (it holds the Netlify
   secrets and does not travel via git), and re-run `npm install` (root and `site/`).
5. **Storage is now consistent.** Both machines keep this repo at a plain local path under
   `Projects\`, outside any synced folder. Home previously sat inside OneDrive (Desktop
   Known-Folder-Move); keep it out. A sync client racing git on `.git/` and `node_modules/`
   is a corruption risk and slows every install, so do not move this repo back under OneDrive.
