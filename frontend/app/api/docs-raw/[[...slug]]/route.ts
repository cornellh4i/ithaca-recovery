import { findDocBySlug } from "../../../../util/docs/loadDocs";

// Backs /docs/<slug>.md (see next.config.mjs's rewrites -- that's what turns the clean URL into
// a request here, with the slug forwarded as path segments). Docs are already public at /docs
// itself, so this has no auth guard -- see routeGuards.test.ts's PUBLIC_ROUTES allowlist.
export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const doc = findDocBySlug((slug ?? []).join("/"));
  if (!doc) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(doc.markdown, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
