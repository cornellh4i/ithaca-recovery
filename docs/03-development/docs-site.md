# Docs Site

How this `docs/` folder becomes the in-app `/docs` Resources page, and what to do when adding,
moving, or removing a doc.

---

## How it works

`frontend/build-scripts/generate-docs-content.mjs` runs on every `yarn dev` / `yarn build`. It
snapshots `docs/**/*.md` into `frontend/util/docs/docsContent.generated.ts` (gitignored, never
edited by hand) because `/docs` renders dynamically and Turbopack can't bundle files outside the
project root. `generate-pagefind-index.mjs` reuses the same data to build the search index.

Key behaviors:

- **Hand-curated `MANIFEST`** in the generator lists every doc with its sidebar group, mirroring
  this folder's own README table of contents. The build **fails** naming any `docs/**/*.md`
  missing from the manifest — a new doc can't silently not render.
- **URL slugs** mirror file paths (`02-handoff/support-process.md` → `/docs/02-handoff/support-process`);
  a folder's README maps to `<folder>/overview`.
- **Links between docs** are rewritten to `/docs/<slug>` URLs at build time, so ordinary relative
  markdown links work both on GitHub and in the app. `mailto:`/external links pass through.
- **Images** live in `docs/01-user-guide/assets/` and are flat-copied to `public/docs-assets/`.
- **"Last edited" bylines** come from git history, not frontmatter.

## Adding, moving, or removing a doc

1. Create/move/delete the `.md` file under `docs/`.
2. Update `MANIFEST` in `frontend/build-scripts/generate-docs-content.mjs` (the drift guard
   reminds you if you forget to add; removals fail the build at read time).
3. Update the tables of contents by hand: `docs/README.md` plus the section README
   (`01-user-guide/`, `02-handoff/`, or `03-development/`).
4. When *moving* across sections, fix the doc's own relative links and any other doc linking to
   it (`grep -rn '<name>.md' docs/`).
5. `yarn dev` (or `node build-scripts/generate-docs-content.mjs` from `frontend/`) to verify.
