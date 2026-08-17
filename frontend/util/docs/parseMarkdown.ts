import { marked, Renderer, Parser, type Tokens } from "marked";

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

// Strips markdown syntax down to its rendered text (e.g. "[User Guide](url)" -> "User Guide"),
// via marked's own Parser.textRenderer -- reused for both the slug and the TOC label below, so a
// heading written as a markdown link doesn't leave "[User Guide](url)"-style raw syntax in the
// slug or in DocsTocList's sidebar (which renders TocItem.text as plain text, not HTML). Takes the
// heading token's already-lexed `tokens` (not the raw source string) to avoid re-lexing the same
// text a renderer.heading call already has tokens for.
const plainTextParser = new Parser();
function headingPlainText(tokens: Tokens.Heading["tokens"]): string {
  return plainTextParser.parseInline(tokens, plainTextParser.textRenderer);
}

const CALLOUT_LABELS: Record<string, string> = {
  NOTE: "NOTE",
  TIP: "TIP",
  IMPORTANT: "IMPORTANT",
  WARNING: "WARNING",
  CAUTION: "CAUTION",
};

// Path data lifted straight from the matching @mui/icons-material icon (see node_modules or
// Toast.tsx's own VARIANT_ICON map, which uses the same WarningAmber for its warning variant) --
// rendered as a raw inline <svg>, not the React component, since this whole callout is a plain
// HTML string produced by marked, not JSX. fill="currentColor" means the icon automatically picks
// up whatever color :global(.calloutLabel) sets per callout-* variant, no separate color needed.
const CALLOUT_ICON_PATHS: Record<string, string[]> = {
  NOTE: [
    "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8",
  ], // InfoOutlined
  TIP: [
    "M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7",
  ], // Lightbulb
  IMPORTANT: [
    "M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8",
  ], // ErrorOutline
  WARNING: ["M12 5.99 19.53 19H4.47zM12 2 1 21h22z", "M13 16h-2v2h2zm0-6h-2v5h2z"], // WarningAmber
  CAUTION: [
    "M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27zM19 14.9 14.9 19H9.1L5 14.9V9.1L9.1 5h5.8L19 9.1zm-4.17-7.14L12 10.59 9.17 7.76 7.76 9.17 10.59 12l-2.83 2.83 1.41 1.41L12 13.41l2.83 2.83 1.41-1.41L13.41 12l2.83-2.83z",
  ], // DangerousOutlined
};

function calloutIconSvg(kind: string): string {
  const paths = CALLOUT_ICON_PATHS[kind].map((d) => `<path d="${d}"/>`).join("");
  return `<svg class="calloutIcon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${paths}</svg>`;
}

// GitHub's alert syntax -- a blockquote whose first line is "[!WARNING]" (etc.) -- renders as a
// distinctly-styled callout instead of a plain blockquote. Reuses the same success/error/warning/
// info color language as Toast.module.scss's variants (see DocsShell.module.scss's :global(.callout-*)
// rules), and degrades gracefully to a normal blockquote with a visible "[!WARNING]" line if ever
// viewed as raw markdown outside this renderer (e.g. on GitHub, which renders the same syntax
// natively).
const CALLOUT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i;

// ContentCopy / Check path data, same MUI-lift idiom as CALLOUT_ICON_PATHS above (Icon.tsx maps
// "copy"/"check" to the same two icons). Both are always in the button's markup; which one shows
// is CSS keyed off data-copied, so the copy handler (util/docs/codeCopy.ts) only flips one
// attribute instead of rewriting SVG.
const COPY_ICON_SVG =
  '<svg class="codeCopyIconCopy" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/></svg>';
const CHECK_ICON_SVG =
  '<svg class="codeCopyIconCheck" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

export function parseMarkdown(markdown: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const slugCounts = new Map<string, number>();
  const renderer = new Renderer();
  // Wraps every fenced/indented code block with a copy button, mirroring the Backups admin
  // tab's command box. The button ships inside the HTML string (not as a React child) because
  // this article renders via dangerouslySetInnerHTML — DocsArticle owns the one delegated click
  // handler (util/docs/codeCopy.ts), so the buttons survive innerHTML re-assignments with no
  // re-decoration pass.
  const baseCode = Renderer.prototype.code;
  renderer.code = function (token: Tokens.Code) {
    return `<div class="codeBlock"><button type="button" class="codeCopyButton" aria-label="Copy code block">${COPY_ICON_SVG}${CHECK_ICON_SVG}</button>${baseCode.call(this, token)}</div>\n`;
  };
  renderer.blockquote = ({ text, tokens }: Tokens.Blockquote) => {
    const match = text.match(CALLOUT_MARKER);
    if (!match) {
      return `<blockquote>\n${marked.parser(tokens, { renderer })}</blockquote>\n`;
    }
    const kind = match[1].toUpperCase();
    const body = text.slice(match[0].length);
    const bodyHtml = marked.parser(marked.lexer(body), { renderer });
    return `<div class="callout callout-${kind.toLowerCase()}"><p class="calloutLabel">${calloutIconSvg(kind)}${CALLOUT_LABELS[kind]}</p>${bodyHtml}</div>\n`;
  };
  renderer.heading = ({ text, depth, tokens }: Tokens.Heading) => {
    // Repeated heading text (e.g. two "Overview" sections in one doc) would otherwise collide on
    // both the rendered element's id and the TOC's own slug -- a fragment link then always jumps
    // to the first match, and DocsTocList's `key={item.slug}` would collide too.
    const plainText = headingPlainText(tokens);
    const baseSlug = slugify(plainText) || "section";
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    if (depth <= 2) toc.push({ level: depth, text: plainText, slug });
    // parseInline renders inline markdown within the heading (several docs headings wrap
    // route paths in backticks, e.g. `### `POST /api/write/meeting``) -- the raw token text
    // alone would leave those backticks showing instead of styled <code>.
    return `<h${depth} id="${slug}">${marked.parseInline(text)}</h${depth}>`;
  };
  const html = marked.parse(markdown, { renderer }) as string;
  return { html, toc };
}
