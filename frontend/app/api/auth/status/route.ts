import { authProvider } from "../../../../services/auth";

const authenticateStatus = async (request: Request) => {
  try {
    const { account } = await authProvider.authenticate();
    return new Response(JSON.stringify({ isAuthenticated: account !== null }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error checking authentication status: ", error);
    return new Response(JSON.stringify({ error: "Error checking authentication status" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export { authenticateStatus as GET }

// export default async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse<ResponseData>
// ) {
//   // Only allow GET requests
//   if (req.method !== 'GET') {
//     return res.status(405).json({ error: 'Method not allowed' });
//   }
  
//   try {
//     console.log("TRYING TO AUTHENTICATE...")
//     const { account } = await authProvider.authenticate();
//     console.log("AUTHENTICATED?")
//     res.status(200).json({ isAuthenticated: account !== null });
//   } catch (error) {
//     console.error("Authentication error:", error);
//     res.status(200).json({ isAuthenticated: false });
//   }
// }