"use client"

import { useState, useEffect } from "react";
import { PropsWithChildren } from "react";
import Navigation from "./components/navigation";
import { Inter } from "next/font/google";
import styles from "../styles/MainLayout.module.scss";
import type { AccountInfo } from "@azure/msal-browser";

const inter = Inter({ subsets: ["latin"] });

interface ClientLayoutProps {
  initialAccount: AccountInfo | null;
  authRedirectUrl: string;
}

export default function ClientLayout({ 
  initialAccount, 
  authRedirectUrl,
  children 
}: PropsWithChildren<ClientLayoutProps>) {
  const account = initialAccount;
  const [showSignIn, setShowSignIn] = useState(false);

  // Sign-in redirection
  useEffect(() => {
    if (!account && showSignIn) {
      window.location.href = authRedirectUrl;
    }
  }, [account, showSignIn, authRedirectUrl]);

  return (
    <html lang="en">
      <head>
      </head>
      <body className={inter.className}>
        <div className={styles.mainlayout}>
          <div className={styles.navigation}>
            <Navigation 
              account={account} 
              setShowSignIn={setShowSignIn} 
            />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}