import { PropsWithChildren } from "react";
import "../../../styles/theme.scss";
import ThemeScript from "../../components/theme/ThemeScript";
import ThemeSync from "../../components/theme/ThemeSync";

export default function LoginLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body style={{ margin: 0 }}>
        {children}
        <ThemeSync />
      </body>
    </html>
  );
}
