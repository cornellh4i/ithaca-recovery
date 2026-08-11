// Snapshots docs/ (repo root, one level above this app) into a generated TS module inside
// frontend/ so the /docs page never reads the filesystem at request time. Necessary, not just
// convenient: /docs is dynamically rendered (its (main) layout reads cookies for auth, which
// forces the whole route tree dynamic), and Turbopack flatly refuses to trace/bundle files
// outside the project root ("glob '../docs/**/*' is invalid, it has a prefix that navigates out
// of the project root") -- a runtime fs.readFileSync("../docs/...") would 500 in production.
//
// Run via the "dev"/"build" scripts in package.json, not a git-tracked "scripts/" one-off
// (that directory is local-only per this repo's convention, so anything Vercel needs to run
// can't live there). Regenerated on every dev/build -- docs/ stays the single source of truth,
// this file is a disposable, gitignored build artifact.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(scriptDir, "..");
const repoRoot = path.join(frontendRoot, "..");
const docsRoot = path.join(repoRoot, "docs");
const outFile = path.join(frontendRoot, "util", "docs", "docsContent.generated.ts");

// Hand-curated mirror of docs/README.md's own table of contents (group + per-group ordering) --
// not derived by parsing that file, since treating prose as a machine manifest is brittle. Keep
// this in sync by hand when docs/ files are added, removed, or reordered.
//
// Nested subfolders (docs/01-user-guide/{tutorials,how-to,reference,explanation}/,
// docs/03-development/testing/) have no sidebar equivalent -- the design has no 3rd nesting
// level -- so each subfolder's docs flatten into their parent group, in the same
// tutorial -> how-to -> reference -> explanation reading order docs/01-user-guide/README.md
// itself recommends.
const MANIFEST = [
  { group: "Overview", relPath: "README.md" },
  { group: "User Guide", relPath: "01-user-guide/README.md" },
  { group: "User Guide", relPath: "01-user-guide/tutorials/your-first-meeting.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/create-edit-delete-meetings.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/suspend-and-resume-a-meeting.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/set-up-a-recurring-meeting.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/navigate-and-filter-the-calendar.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/export-data.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/use-digital-signage.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/manage-admin-users.md" },
  { group: "User Guide", relPath: "01-user-guide/how-to/retry-a-failed-sync.md" },
  { group: "User Guide", relPath: "01-user-guide/reference/roles-and-permissions.md" },
  { group: "User Guide", relPath: "01-user-guide/reference/meeting-fields-and-modes.md" },
  { group: "User Guide", relPath: "01-user-guide/reference/troubleshooting.md" },
  { group: "User Guide", relPath: "01-user-guide/reference/icon-and-badge-legend.md" },
  { group: "User Guide", relPath: "01-user-guide/reference/quick-reference-card.md" },
  { group: "User Guide", relPath: "01-user-guide/explanation/how-sync-works.md" },
  { group: "User Guide", relPath: "01-user-guide/explanation/why-some-actions-cant-be-undone.md" },
  { group: "User Guide", relPath: "01-user-guide/explanation/calendar-view-behavior.md" },
  { group: "Handoff", relPath: "02-handoff/README.md" },
  { group: "Handoff", relPath: "02-handoff/ownership-and-access.md" },
  { group: "Handoff", relPath: "02-handoff/credentials-and-integrations.md" },
  { group: "Handoff", relPath: "02-handoff/deployment-and-rollback.md" },
  { group: "Handoff", relPath: "02-handoff/backups-and-recovery.md" },
  { group: "Handoff", relPath: "02-handoff/support-process.md" },
  { group: "Handoff", relPath: "02-handoff/contingency-transfer.md" },
  { group: "Handoff", relPath: "02-handoff/technical-decisions.md" },
  { group: "Development", relPath: "03-development/README.md" },
  { group: "Development", relPath: "03-development/local-setup.md" },
  { group: "Development", relPath: "03-development/project-structure.md" },
  { group: "Development", relPath: "03-development/api-reference.md" },
  { group: "Development", relPath: "03-development/environment-variables.md" },
  { group: "Development", relPath: "03-development/integration-guides.md" },
  { group: "Development", relPath: "03-development/ci-cd.md" },
  { group: "Development", relPath: "03-development/testing/README.md" },
  { group: "Development", relPath: "03-development/testing/manual-test-script-template.md" },
];

const TITLE_PATTERN = /^#\s+(.+)$/m;

// URL slug mirrors the file's own path under docs/ (e.g. "02-handoff/ownership-and-access.md"
// -> "02-handoff/ownership-and-access"), so /docs/<slug> reads directly as "which file". A
// folder's own README maps to "<folder>/overview" -- not the bare folder path -- so a group's
// index doc has an explicit URL of its own; page.tsx redirects the bare folder path (e.g.
// /docs/02-handoff) there. The repo-root README (slug "") is what bare /docs resolves to.
function slugFromRelPath(relPath) {
  const noExt = relPath.replace(/\.md$/, "");
  if (noExt === "README") return "";
  if (noExt.endsWith("/README")) return `${noExt.slice(0, -"/README".length)}/overview`;
  return noExt;
}

// Readable label for a doc's immediate subfolder (e.g. "how-to" -> "How-to") -- an explicit
// lookup rather than a generic title-case transform, so this matches the exact wording already
// used in prose elsewhere (docs/01-user-guide/README.md's own "How-to guides" etc.), not a
// mechanically-different-looking variant.
const SUBGROUP_LABELS = {
  tutorials: "Tutorials",
  "how-to": "How-to",
  reference: "Reference",
  explanation: "Explanation",
  testing: "Testing",
};

// A doc one folder deeper than its group root (e.g. "01-user-guide/tutorials/foo.md", 3 parts)
// gets a sidebar subcategory; a doc directly in the group root (e.g. "01-user-guide/README.md" or
// "03-development/local-setup.md", 2 parts) doesn't -- mirrors buildGroups' own group-then-flat-
// list shape in DocsShell.tsx, just one level deeper. Falls back to the raw slug (title-cased)
// for a subfolder not yet in SUBGROUP_LABELS, rather than silently dropping it from the sidebar.
function subgroupFromRelPath(relPath) {
  const parts = relPath.split("/");
  if (parts.length < 3) return null;
  const rawSubgroup = parts[1];
  return SUBGROUP_LABELS[rawSubgroup] ?? rawSubgroup.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Rewrites a markdown link target found in some doc's own markdown into an app-absolute
// /docs/<slug> URL, so links between docs work when rendered inside the app (their original
// hrefs are relative to the *file's* location within docs/, which means nothing once that
// content is served from an app route instead of viewed as a file). currentDir is the linking
// doc's own directory under docs/ ("" for repo-root docs), used to resolve a relative href the
// same way a file browser would.
function resolveDocLink(href, currentDir) {
  // Split off the query/fragment before any path handling -- "foo.md#section" is a single path
  // segment as far as path.posix.join/normalize are concerned, so left unsplit its ".md" never
  // lands at the end of the string and slugFromRelPath's own suffix stripping never fires.
  const [, hrefPath, query = "", fragment = ""] = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/) ?? [null, href];
  const withoutTrailingSlash = hrefPath.replace(/\/$/, "");
  const joined = path.posix.normalize(path.posix.join(currentDir, withoutTrailingSlash));
  const slug = slugFromRelPath(joined.endsWith(".md") ? joined : `${joined}.md`);
  return `/docs/${slug}${query}${fragment}`;
}

// Only rewrites inter-doc links: external (http/https/mailto) and same-page anchors (#slug) are
// left alone, and a link that already has a docs/ prefix (absolute or relative) is left alone
// too, on the assumption whoever wrote it already meant exactly that path. The negative
// lookbehind excludes image syntax (`![alt](src)`) -- those are rewritten separately by
// rewriteImageSrcs below, since an image src needs a /docs-assets/ URL, not a /docs/<slug> one.
function rewriteInterPageLinks(markdown, currentDir) {
  return markdown.replace(/(?<!!)(\[[^\]]*\]\()([^)]+)(\))/g, (match, open, href, close) => {
    if (/^([a-z]+:|#)/i.test(href) || /^\/?docs\//.test(href)) {
      return match;
    }
    return `${open}${resolveDocLink(href, currentDir)}${close}`;
  });
}

// docs/ images (currently just docs/01-user-guide/assets/) are copied into public/docs-assets/
// (see copyDocAssets below) and served flat from there, so this only needs the basename -- not
// full relative-path resolution like rewriteInterPageLinks -- since there's exactly one source
// folder today. External image URLs are left alone.
function rewriteImageSrcs(markdown) {
  return markdown.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (match, open, src, close) => {
    if (/^([a-z]+:)/i.test(src)) return match;
    return `${open}/docs-assets/${path.posix.basename(src)}${close}`;
  });
}

// Turbopack can't bundle files outside the project root (see the module comment above) any more
// for images than for the markdown itself -- so doc screenshots have to actually live under
// public/ to be served at all, not just referenced by a rewritten URL. Flat copy, no
// subdirectories: matches rewriteImageSrcs' basename-only rewrite above.
const assetsSourceDir = path.join(docsRoot, "01-user-guide", "assets");
const assetsDestDir = path.join(frontendRoot, "public", "docs-assets");
function copyDocAssets() {
  if (!fs.existsSync(assetsSourceDir)) return;
  fs.mkdirSync(assetsDestDir, { recursive: true });
  for (const file of fs.readdirSync(assetsSourceDir)) {
    fs.copyFileSync(path.join(assetsSourceDir, file), path.join(assetsDestDir, file));
  }
}

// "Last edited"/"edited by" read from git history (author date + name of the file's most recent
// commit) rather than frontmatter -- git can't go stale the way a hand-maintained field would,
// since it's just what actually happened. relPath is git-relative to repoRoot, not docsRoot,
// since that's the working tree git was invoked in below.
//
// Falls back to the file's mtime (no author) when git has nothing: a doc that's been created or
// edited but not yet committed -- true for most of this repo's docs/ during active work on
// them -- has no history to read yet. Also falls back (with a console.warn) if the git binary
// itself is unavailable or docsRoot isn't inside a git working tree, so a stripped-down build
// environment degrades to "no byline" instead of failing the whole build.
function lastEditInfo(relPath) {
  try {
    const output = execFileSync(
      "git",
      ["log", "-1", "--format=%aI%x09%an", "--", path.posix.join("docs", relPath)],
      { cwd: repoRoot, encoding: "utf-8" }
    ).trim();
    if (output) {
      const [iso, author] = output.split("\t");
      return { lastEdited: iso, editedBy: author };
    }
  } catch (err) {
    console.warn(`generate-docs-content: git log failed for docs/${relPath}, falling back to mtime (${err.message})`);
  }
  const mtime = fs.statSync(path.join(docsRoot, relPath)).mtime;
  return { lastEdited: mtime.toISOString(), editedBy: null };
}

// Rough word count is plenty accurate for "N min read" -- no need to strip markdown syntax
// (headings/links/code fences) first, since punctuation-heavy tokens still count as ~1 word each,
// which is close enough to how a reader actually experiences a code block or a link. 238 wpm is a
// commonly cited average adult silent-reading speed; rounded up so short docs don't read "0 min".
const WORDS_PER_MINUTE = 238;
function readingTimeMinutes(markdown) {
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

// Exported (not just written to outFile) so generate-pagefind-index.mjs can reuse this exact
// array -- it needs the same slug/title/markdown data to build the search index, and importing
// it here avoids that script re-reading docs/ itself or importing the generated *.ts* output
// (plain node can't parse TypeScript module resolution the way webpack/tsc do).
export const docs = MANIFEST.map(({ group, relPath }) => {
  const raw = fs.readFileSync(path.join(docsRoot, relPath), "utf-8");
  const title = raw.match(TITLE_PATTERN)?.[1] ?? relPath;
  const slug = slugFromRelPath(relPath);
  const subgroup = subgroupFromRelPath(relPath);
  const currentDir = path.posix.dirname(relPath); // "." for a repo-root file
  const markdown = rewriteImageSrcs(rewriteInterPageLinks(raw, currentDir === "." ? "" : currentDir));
  const { lastEdited, editedBy } = lastEditInfo(relPath);
  return { slug, title, group, subgroup, markdown, lastEdited, editedBy, readingTimeMinutes: readingTimeMinutes(markdown) };
});

// Guarded so importing `docs` from generate-pagefind-index.mjs doesn't also re-run this file's
// own write -- only the direct `node build-scripts/generate-docs-content.mjs` invocation (the
// "dev"/"build" package.json scripts) should write docsContent.generated.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  copyDocAssets();
  const entries = docs
    .map(
      (doc) =>
        `  { slug: ${JSON.stringify(doc.slug)}, title: ${JSON.stringify(doc.title)}, group: ${JSON.stringify(doc.group)}, subgroup: ${JSON.stringify(doc.subgroup)}, markdown: ${JSON.stringify(doc.markdown)}, lastEdited: ${JSON.stringify(doc.lastEdited)}, editedBy: ${JSON.stringify(doc.editedBy)}, readingTimeMinutes: ${doc.readingTimeMinutes} }`
    )
    .join(",\n");

  const output = `// AUTO-GENERATED by build-scripts/generate-docs-content.mjs -- do not edit by hand.
// Source of truth: docs/ at the repo root. Regenerated on every dev/build run.

export const DOCS = [
${entries},
];
`;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, output);
  console.log(`Generated ${path.relative(frontendRoot, outFile)} from ${docs.length} docs/ files.`);
}
