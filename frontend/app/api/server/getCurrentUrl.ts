import type { NextApiRequest, NextApiResponse } from 'next';
import { headers } from 'next/headers';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    const currentHeaders = headers();
    const url = currentHeaders.get('x-url') || 'default-url-if-not-found';
    res.status(200).json({ url });
}