// Builds the Pagefind search index DocsShell's search reads from in production (see
// hooks/usePagefindComponentUI.ts) -- /pagefind/pagefind-component-ui.js and its data files only
// exist after this runs, which is why "dev" doesn't run this script and search does nothing in
// dev (Pagefind's custom elements register but have no index to query against).
//
// Must run after generate-docs-content.mjs (same build script chain, see package.json) so `docs`
// reflects the freshest docs/ snapshot. Imports that script's `docs` array directly rather than
// re-reading docs/ or importing its generated *.ts* output, which plain node can't module-resolve
// the way webpack/tsc do.
import path from "path";
import { fileURLToPath } from "url";
import * as pagefind from "pagefind";
import { marked, Renderer } from "marked";
import { docs } from "./generate-docs-content.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(scriptDir, "..");
const outputPath = path.join(frontendRoot, "public", "pagefind");

// Mirrors util/docs/parseMarkdown.ts's slugify + heading renderer exactly -- a search sub-result
// is only useful if its url's #anchor is a real heading id in the client's rendered DOM, since
// DocsShell scrolls to that id by querying for it after navigating. Node can't import that .ts
// file directly here (see the same constraint noted in util/common/breakpoints.ts), so this is
// kept in sync by hand.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function renderHtml(markdown) {
  const renderer = new Renderer();
  renderer.heading = ({ text, depth }) => {
    const slug = slugify(text);
    return `<h${depth} id="${slug}">${marked.parseInline(text)}</h${depth}>`;
  };
  return marked.parse(markdown, { renderer });
}

// Mirrors DocsShell.tsx's docHref -- the root doc's slug is "" (/docs itself, not /docs/).
function docHref(slug) {
  return slug === "" ? "/docs" : `/docs/${slug}`;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const { index, errors: createErrors } = await pagefind.createIndex();
if (createErrors.length > 0) {
  throw new Error(`Failed to create Pagefind index: ${createErrors.join(", ")}`);
}

for (const doc of docs) {
  // data-pagefind-body scopes indexing to this element -- irrelevant here since content is
  // exactly one doc's own markup with no surrounding chrome, but explicit is cheap.
  const content = `<html><head><title>${escapeHtml(doc.title)}</title></head><body><main data-pagefind-body>${renderHtml(doc.markdown)}</main></body></html>`;
  const { errors } = await index.addHTMLFile({ url: docHref(doc.slug), content });
  if (errors.length > 0) {
    throw new Error(`Failed to index doc "${doc.slug}": ${errors.join(", ")}`);
  }
}

const { errors: writeErrors } = await index.writeFiles({ outputPath });
if (writeErrors.length > 0) {
  throw new Error(`Failed to write Pagefind index: ${writeErrors.join(", ")}`);
}

console.log(`Generated Pagefind index for ${docs.length} docs at ${path.relative(frontendRoot, outputPath)}.`);
await pagefind.close();
