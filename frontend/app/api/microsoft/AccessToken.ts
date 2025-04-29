import { ConfidentialClientApplication } from '@azure/msal-node';
const cca = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.CLIENT_ID!,
    authority: `${process.env.CLOUD_INSTANCE}${process.env.TENANT_ID}`,
    clientSecret: process.env.CLIENT_SECRET!
  }
});
const getAccessToken = async (): Promise<string | null> => {
  try {
    const result = await cca.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });
    if (!result?.accessToken) {
      console.error("[AccessToken] No token returned");
      return null;
    }
    return result.accessToken;
  } catch (err) {
    console.error("[AccessToken] Failed to get token:", err);
    return null;
  }
};
export default getAccessToken;