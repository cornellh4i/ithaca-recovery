import { getAuth } from "../../../../services/auth";

const account = async (request: Request) => {
    const session = await getAuth();
    return new Response(JSON.stringify(session?.user ?? null), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
    });
};

export { account as GET };
