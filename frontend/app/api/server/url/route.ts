import type { NextApiRequest, NextApiResponse } from 'next';
import { headers } from 'next/headers'

const getUrl = async (request: Request) => {
    const currentHeaders = headers();
    const url = currentHeaders.get('x-url') || 'default-url-if-not-found';
    return new Response(JSON.stringify(url), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

export { getUrl as GET }