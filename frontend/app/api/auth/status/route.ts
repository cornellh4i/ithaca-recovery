import { getAuth } from "../../../../services/auth";

const authenticateStatus = async (request: Request) => {
    try {
        const session = await getAuth();
        return new Response(JSON.stringify({ isAuthenticated: session !== null }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });
    } catch (error) {
        console.error("Error checking authentication status: ", error);
        return new Response(
            JSON.stringify({ error: "Error checking authentication status" }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }
};

export { authenticateStatus as GET };
