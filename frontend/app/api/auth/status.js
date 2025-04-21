import { authProvider } from "../../../services/auth";

export default async function handler(req, res) {
  try {
    const { account } = await authProvider.authenticate();
    res.status(200).json({ isAuthenticated: account !== null });
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(200).json({ isAuthenticated: false });
  }
}