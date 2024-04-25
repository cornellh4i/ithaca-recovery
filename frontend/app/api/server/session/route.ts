import type { NextApiRequest, NextApiResponse } from 'next';
import { cookies } from 'next/headers'

export const getCookie = async (request: Request) => {
    console.log("here")
    const sessionCookie = cookies().get('__session');
    const session = sessionCookie?.value
    console.log(session);
    return new Response(JSON.stringify(session), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

export { getCookie as GET }