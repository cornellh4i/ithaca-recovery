import { PropsWithChildren } from "react";

export default function LoginLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
