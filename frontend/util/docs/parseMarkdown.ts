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
  const renderer = new Renderer();
  renderer.heading = ({ text, depth }: Tokens.Heading) => {
    const slug = slugify(text);
    if (depth <= 2) toc.push({ level: depth, text, slug });
    // parseInline renders inline markdown within the heading (several docs headings wrap
    // route paths in backticks, e.g. `### `POST /api/write/meeting``) -- the raw token text
    // alone would leave those backticks showing instead of styled <code>.
    return `<h${depth} id="${slug}">${marked.parseInline(text)}</h${depth}>`;
  };
  const html = marked.parse(markdown, { renderer }) as string;
  return { html, toc };
}
