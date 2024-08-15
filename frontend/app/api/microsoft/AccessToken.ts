import { authProvider } from "../../../services/auth";

const getAccessToken = async () => {
    try {
        const { account } = await authProvider.authenticate();
        const accessToken = await authProvider.getAccessToken();
        return accessToken;
    } catch (error) {
        console.log(error);
        return null;
    }
}

export default getAccessToken;