import { PropsWithChildren } from "react";
import type { Metadata } from "next";
import "../../../styles/theme.scss";

export const metadata: Metadata = {
  title: "Signage | Ithaca Community Recovery",
};

// Pinned light, with no pre-paint script or switcher: the wall display shares the app's tokens
// but keeps its own default, and whether it should ever default to dark is ICR's call.
export default function SignageLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" data-theme="light">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
