// import "./globals.css";
// import React from 'react';
// import App from 'next/app';
// import { Inter } from "next/font/google";
// import { useMsal, MsalProvider, MsalAuthenticationTemplate } from "@azure/msal-react";
// import { loginRequest, msalConfig } from "./auth/authConfig.js"
// import { PublicClientApplication, EventType, EventMessage, AccountInfo, InteractionType } from "@azure/msal-browser";
// import MainPage from "./page";

// const msalInstance = new PublicClientApplication(msalConfig);

// msalInstance.initialize().then(() => {
//   // Account selection logic is app dependent. Adjust as needed for different use cases.
//   const accounts: AccountInfo[] = msalInstance.getAllAccounts();
//   if (accounts.length > 0) {
//     msalInstance.setActiveAccount(accounts[0]);
//   }

//   msalInstance.addEventCallback((event: EventMessage) => {
//     if (event.eventType === EventType.LOGIN_SUCCESS && event.payload && 'account' in event.payload) {
//       const account = event.payload.account as AccountInfo;
//       msalInstance.setActiveAccount(account);
//     }
//   });
// });

// const RootLayout = ({ children }: { children: React.ReactNode }) => {

//   // useEffect(() => {
//   //   const accounts = instance.getAllAccounts();
//   //   if (accounts.length === 0) {
//   //     instance.loginRedirect(loginRequest).catch((e) => {
//   //       console.error(e);
//   //     });
//   //   }
//   // }, [instance]);

//   // useEffect(() => {
//   //   const accounts = instance.getAllAccounts();
//   //   if (accounts.length === 0 && inProgress === "none") {
//   //     instance.loginRedirect().catch(console.error);
//   //   }
//   // }, [instance, inProgress]);

//   return (
//     <App>
//       <html lang="en">
//         <body>
//           <MsalProvider instance={msalInstance}>
//             <MsalAuthenticationTemplate interactionType={InteractionType.Redirect}>
//               {children}
//             </MsalAuthenticationTemplate>
//           </MsalProvider>
//         </body>
//       </html>
//     </App>

//   );
// };

import { redirect } from "next/navigation";
import { PropsWithChildren } from "react";
import { loginRequest } from "./auth/authConfig";
import { authProvider } from "../services/auth";
import { getCurrentUrl } from "./auth/url";
import Navigation from "./components/navigation";
import React from "react";
import { useState, useEffect } from "react";
import { Inter } from "next/font/google";
import styles from "../styles/MainLayout.module.scss";
import type { AccountInfo } from "@azure/msal-browser";

const inter = Inter({ subsets: ["latin"] });

export default async function RootLayout({ children }: PropsWithChildren) {
  
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);

  if (!account && showSignIn) {
    redirect(await authProvider.getAuthCodeUrl(loginRequest, getCurrentUrl()));
  }

  return (
    <html lang="en">
      <head>
      </head>
      <body className={inter.className}>
          <div className={styles.mainlayout}>
            <div className={styles.navigation}>
              <Navigation account={account} setShowSignIn={setShowSignIn} />
            </div>
            {children}
          </div>
      </body>
    </html>
  );
}
