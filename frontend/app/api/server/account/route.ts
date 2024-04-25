import { getAccount } from "../../../../actions/auth";

const account = async (request: Request) => {
    const account = await getAccount();
    return new Response(JSON.stringify(account), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

export { account as GET }