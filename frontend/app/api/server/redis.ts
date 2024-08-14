// import type { NextApiRequest, NextApiResponse } from 'next';
// import { redisClient } from '../../../services/redis';

// async function getRedisData() {
//     await redisClient.connect();
//     const data = await redisClient.get('yourKey');
//     await redisClient.disconnect();
//     return data;
// }

// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//     try {
//         const data = await getRedisData();
//         res.status(200).json({ data });
//     } catch (error) {
//         console.error('Failed to get data from Redis:', error);
//         res.status(500).json({ error: 'Failed to access Redis data' });
//     }
// }