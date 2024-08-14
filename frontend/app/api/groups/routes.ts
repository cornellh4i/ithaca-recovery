import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { accessToken } = req.body;
    const endpoint = "https://graph.microsoft.com/" + `/groups`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: headers
    });
    if (!response.ok) {
      throw new Error('Error');
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Error' });
  }
}
