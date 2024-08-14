import { NextApiRequest, NextApiResponse } from 'next';

const getCalendars = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { accessToken, groupId } = req.body;
    const endpoint = `https://graph.microsoft.com/groups/${groupId}/calendar`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: headers
    });
    if (!response.ok) {
      throw new Error('Error fetching calendar');
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching calendar:', error);
    res.status(500).json({ error: 'Error fetching calendar' });
  }
}

export {getCalendars as GET}