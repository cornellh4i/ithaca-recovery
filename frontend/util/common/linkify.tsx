import type { ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

// Splits plain text on bare URLs and wraps each one in a real <a> -- Zoom's invitation text
// (and free-typed meeting descriptions) routinely include a raw join link with no markup of
// its own, so without this the URL renders as inert text instead of something clickable.
export function linkify(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, index) =>
    // Capturing-group split alternates plain text (even) and matched URLs (odd).
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}
