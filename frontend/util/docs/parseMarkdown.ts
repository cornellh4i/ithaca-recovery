import { marked, Renderer, type Tokens } from "marked";

export interface TocItem {
  level: number;
  text: string;
  slug: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function parseMarkdown(markdown: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const slugCounts = new Map<string, number>();
  const renderer = new Renderer();
  renderer.heading = ({ text, depth }: Tokens.Heading) => {
    // Repeated heading text (e.g. two "Overview" sections in one doc) would otherwise collide on
    // both the rendered element's id and the TOC's own slug -- a fragment link then always jumps
    // to the first match, and DocsTocList's `key={item.slug}` would collide too.
    const baseSlug = slugify(text) || "section";
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    if (depth <= 2) toc.push({ level: depth, text, slug });
    // parseInline renders inline markdown within the heading (several docs headings wrap
    // route paths in backticks, e.g. `### `POST /api/write/meeting``) -- the raw token text
    // alone would leave those backticks showing instead of styled <code>.
    return `<h${depth} id="${slug}">${marked.parseInline(text)}</h${depth}>`;
  };
  const html = marked.parse(markdown, { renderer }) as string;
  return { html, toc };
}
