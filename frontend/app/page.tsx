'use client'
import React, { useEffect } from 'react';
import HomePage from "./components/templates/HomePageLayout";
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal, useMsalAuthentication } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import { authProvider } from "../services/auth";

import DailyView from "./components/organisms/DailyView/index";

// const MainPage = () => {

//   const request = {
//     loginHint: "name@example.com",
//     scopes: ["User.Read"]
//   }

//   const { login, result, error } = useMsalAuthentication(InteractionType.Silent, request);

//   useEffect(() =s> {
//     if (error) {
//       login(InteractionType.Popup, request);
//     }
//   }, [error]);

//   const { accounts } = useMsal();

//   return (
//     <React.Fragment>
//       <AuthenticatedTemplate>
//         <Navigation />
//       </AuthenticatedTemplate>
//       <UnauthenticatedTemplate>
//         Not signed in
//       </UnauthenticatedTemplate>
//     </React.Fragment>
//   );
// }

// export default MainPage

export default function ForcedPage() 
{
  return <div><DailyView /></div>;
}