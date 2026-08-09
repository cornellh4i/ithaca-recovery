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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(scriptDir, "..");
const docsRoot = path.join(frontendRoot, "..", "docs");
const outFile = path.join(frontendRoot, "util", "docs", "docsContent.generated.ts");

// Hand-curated mirror of docs/README.md's own table of contents (group + per-group ordering) --
// not derived by parsing that file, since treating prose as a machine manifest is brittle. Keep
// this in sync by hand when docs/ files are added, removed, or reordered.
//
// docs/03-development/testing/ is a nested subfolder with no sidebar equivalent (the design has
// no 3rd nesting level), so its two docs flatten into the Development group after the rest.
const MANIFEST = [
  { group: "Overview", relPath: "README.md" },
  { group: "User Guide", relPath: "01-user-guide/user-guide.md" },
  { group: "Handoff", relPath: "02-handoff/README.md" },
  { group: "Handoff", relPath: "02-handoff/ownership-and-access.md" },
  { group: "Handoff", relPath: "02-handoff/credentials-and-integrations.md" },
  { group: "Handoff", relPath: "02-handoff/deployment-and-rollback.md" },
  { group: "Handoff", relPath: "02-handoff/backups-and-recovery.md" },
  { group: "Handoff", relPath: "02-handoff/support-process.md" },
  { group: "Handoff", relPath: "02-handoff/contingency-transfer.md" },
  { group: "Handoff", relPath: "02-handoff/technical-decisions.md" },
  { group: "Development", relPath: "03-development/project-structure.md" },
  { group: "Development", relPath: "03-development/api-reference.md" },
  { group: "Development", relPath: "03-development/integration-guides.md" },
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

// Rewrites a markdown link target found in some doc's own markdown into an app-absolute
// /docs/<slug> URL, so links between docs work when rendered inside the app (their original
// hrefs are relative to the *file's* location within docs/, which means nothing once that
// content is served from an app route instead of viewed as a file). currentDir is the linking
// doc's own directory under docs/ ("" for repo-root docs), used to resolve a relative href the
// same way a file browser would.
function resolveDocLink(href, currentDir) {
  const withoutTrailingSlash = href.replace(/\/$/, "");
  const joined = path.posix.normalize(path.posix.join(currentDir, withoutTrailingSlash));
  return `/docs/${slugFromRelPath(joined.endsWith(".md") ? joined : `${joined}.md`)}`;
}

// Only rewrites inter-doc links: external (http/https/mailto) and same-page anchors (#slug) are
// left alone, and a link that already has a docs/ prefix (absolute or relative) is left alone
// too, on the assumption whoever wrote it already meant exactly that path.
function rewriteInterPageLinks(markdown, currentDir) {
  return markdown.replace(/(\[[^\]]*\]\()([^)]+)(\))/g, (match, open, href, close) => {
    if (/^([a-z]+:|#)/i.test(href) || /^\/?docs\//.test(href)) {
      return match;
    }
    return `${open}${resolveDocLink(href, currentDir)}${close}`;
  });
}

// Exported (not just written to outFile) so generate-pagefind-index.mjs can reuse this exact
// array -- it needs the same slug/title/markdown data to build the search index, and importing
// it here avoids that script re-reading docs/ itself or importing the generated *.ts* output
// (plain node can't parse TypeScript module resolution the way webpack/tsc do).
export const docs = MANIFEST.map(({ group, relPath }) => {
  const raw = fs.readFileSync(path.join(docsRoot, relPath), "utf-8");
  const title = raw.match(TITLE_PATTERN)?.[1] ?? relPath;
  const slug = slugFromRelPath(relPath);
  const currentDir = path.posix.dirname(relPath); // "." for a repo-root file
  const markdown = rewriteInterPageLinks(raw, currentDir === "." ? "" : currentDir);
  return { slug, title, group, markdown };
});

// Guarded so importing `docs` from generate-pagefind-index.mjs doesn't also re-run this file's
// own write -- only the direct `node build-scripts/generate-docs-content.mjs` invocation (the
// "dev"/"build" package.json scripts) should write docsContent.generated.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = docs
    .map(
      (doc) =>
        `  { slug: ${JSON.stringify(doc.slug)}, title: ${JSON.stringify(doc.title)}, group: ${JSON.stringify(doc.group)}, markdown: ${JSON.stringify(doc.markdown)} }`
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
