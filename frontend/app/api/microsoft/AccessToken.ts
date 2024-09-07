import { AccountInfo, ConfidentialClientApplication } from "@azure/msal-node";
import { authProvider } from "../../../services/auth";

const getAccessToken = async () => {
    try {
        const accessToken = await authProvider.getAccessToken();
        return accessToken;
    } catch (error) {
        console.log(error);
        return null;
    }
}

export default getAccessToken;