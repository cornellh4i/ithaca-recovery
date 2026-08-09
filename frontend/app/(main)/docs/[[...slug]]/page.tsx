import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { findDocBySlug, loadDocsMeta } from "../../../../util/docs/loadDocs";
import DocsArticle from "../../../components/docs/DocsArticle";

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = findDocBySlug((slug ?? []).join("/"));
  return {
    title: doc ? `${doc.title} | Resources | Ithaca Community Recovery` : "Resources | Ithaca Community Recovery",
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
