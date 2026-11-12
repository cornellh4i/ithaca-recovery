import { PropsWithChildren } from "react";
import "../../../styles/theme.scss";
import ThemeScript, { SERVER_THEME_ATTRIBUTE } from "../../components/theme/ThemeScript";
import { ThemeSync } from "../../components/theme/ThemeDevSwitcher";

export default function LoginLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" data-theme={SERVER_THEME_ATTRIBUTE} suppressHydrationWarning>
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
