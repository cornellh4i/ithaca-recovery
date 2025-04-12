import { authProvider } from "../../../services/auth";

const getAccessToken = async () => {
  try {
    const { account } = await authProvider.authenticate();
    const calendarScopes = [
      "https://graph.microsoft.com/Calendars.Read",
      "https://graph.microsoft.com/Calendars.ReadWrite",
    ];
    const accessToken = await authProvider.getAccessToken({
      scopes: calendarScopes,
      account: account,
    });
    return accessToken;
  } catch (error) {
    console.error("getAccessToken: Error:", error);
    return null;
  }
};

export default getAccessToken;
