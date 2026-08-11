import "server-only";
import { DOCS } from "./docsContent.generated";

export interface DocEntry {
  slug: string;
  title: string;
  group: string;
  // Sidebar subcategory within group (e.g. "Tutorials", "How-to") -- null for a doc directly in
  // its group's own root, which renders flat under the group label with no subcategory header.
  subgroup: string | null;
  markdown: string;
  // Git-derived (see generate-docs-content.mjs's lastEditInfo) -- null editedBy means the file
  // has no git history yet (falls back to filesystem mtime for lastEdited in that case).
  lastEdited: string;
  editedBy: string | null;
  readingTimeMinutes: number;
}

export type DocMeta = Omit<DocEntry, "markdown">;

// DOCS is generated at dev/build time by build-scripts/generate-docs-content.mjs from docs/ at
// the repo root -- see that script for why (Turbopack can't trace files outside the project
// root, and this route is dynamically rendered, so a runtime fs read isn't an option).
export function loadDocs(): DocEntry[] {
  return DOCS;
}

export function findDocBySlug(slug: string): DocEntry | undefined {
  return DOCS.find((doc) => doc.slug === slug);
}

// Sidebar/breadcrumb only ever need title+group+slug -- stripping markdown here keeps the other
// 14 docs' Markdown out of the client bundle for any given page load (only the one active doc's
// markdown is ever passed to DocsShell).
export function loadDocsMeta(): DocMeta[] {
  return DOCS.map(({ markdown: _markdown, ...meta }) => meta);
}
