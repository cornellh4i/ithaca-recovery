import { PropsWithChildren } from "react";

export default function SignageLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
