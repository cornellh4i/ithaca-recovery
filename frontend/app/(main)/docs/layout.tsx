import { PropsWithChildren } from "react";
import { loadDocsMeta } from "../../../util/docs/loadDocs";
import DocsShell from "../../components/docs/DocsShell";

// Layouts survive a dynamic-segment change (only pages remount) -- DocsShell relies on that to
// keep Pagefind's search modal/trigger mounted exactly once per docs session. See DocsShell.tsx.
export default function DocsLayout({ children }: PropsWithChildren) {
  return <DocsShell docsMeta={loadDocsMeta()}>{children}</DocsShell>;
}
