import { PropsWithChildren } from "react";

export default function SignageLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
