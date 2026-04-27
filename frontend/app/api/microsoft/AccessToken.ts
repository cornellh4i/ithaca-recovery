import { getAuth } from "../../../services/auth";

const getAccessToken = async () => {
    try {
        const session = await getAuth();
        return session?.accessToken ?? null;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export default getAccessToken;
