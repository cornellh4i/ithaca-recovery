'use client'

import React, { useEffect } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal, useMsalAuthentication } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import { authProvider } from "../services/auth";


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

import UploadPandaDocs from './components/atoms/upload/index';

const HomePage: React.FC = () => {
    // Handler function to be called when a file is selected
    const handleFileSelect = (file: File | null) => {
        if (file) {
            console.log('File selected:', file.name);
        } else {
            console.log('No file selected');
        }
    };

    return (
        <div>
            <h1>Upload PandaDocs</h1>
            <UploadPandaDocs onFileSelect={handleFileSelect} />
        </div>
    );
};

export default HomePage;

// export default async function ForcedPage() {

//   return <div>Welcome</div>;
// }
