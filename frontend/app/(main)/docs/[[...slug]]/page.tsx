import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { findDocBySlug, loadDocsMeta } from "../../../../util/docs/loadDocs";
import DocsArticle from "../../../components/docs/DocsArticle";

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

// Handoff and development docs stay publicly reachable (the repo is public anyway, and the
// contingency audience may have no login) but are kept out of search indexes -- they name real
// people/emails and the infra layout, which shouldn't be one web search away.
const NOINDEX_SLUG_PREFIXES = ["02-handoff", "03-development"];

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const routeSlug = (slug ?? []).join("/");
  const doc = findDocBySlug(routeSlug);
  return {
    title: doc ? `${doc.title} | Resources | Ithaca Community Recovery` : "Resources | Ithaca Community Recovery",
    ...(NOINDEX_SLUG_PREFIXES.some((prefix) => routeSlug.startsWith(prefix))
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const routeSlug = (slug ?? []).join("/");
  const activeDoc = findDocBySlug(routeSlug);
  if (!activeDoc) {
    // A bare folder path (e.g. /docs/02-handoff) isn't a doc's own slug -- redirect to the
    // first doc under it, in manifest order (generate-docs-content.mjs's MANIFEST). That's the
    // group's README for most groups since README is listed first there, but this doesn't
    // specifically search for a README -- whatever's first is "the first page of it".
    const prefix = routeSlug === "" ? "" : `${routeSlug}/`;
    const firstChild = loadDocsMeta().find((doc) => doc.slug.startsWith(prefix) && doc.slug !== routeSlug);
    if (firstChild) {
      redirect(`/docs/${firstChild.slug}`);
    }
    notFound();
  }
  return <DocsArticle activeDoc={activeDoc} />;
}
