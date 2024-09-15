import type { NextApiRequest, NextApiResponse } from 'next';
import { cookies } from 'next/headers';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    const sessionCookie = cookies().get('__session');
    const val = sessionCookie?.value
    console.log(val); 
    res.status(200).json({ session: val });
    return new Response(JSON.stringify(val), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
    
}