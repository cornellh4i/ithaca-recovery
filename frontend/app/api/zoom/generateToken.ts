import axios from 'axios';
import qs from 'query-string';

// Function to generate a Zoom access token
const generateZoomToken = async (zoomAccount: string): Promise<string> => {
  try {
    const clientId = process.env[`${zoomAccount}_CLIENT_ID`];
    const clientSecret = process.env[`${zoomAccount}_CLIENT_SECRET`];
    const accountId = process.env[`${zoomAccount}_ACCOUNT_ID`];

    // Ensure environment variables are set
    if (!clientId || !clientSecret || !accountId) {
      throw new Error(`Environment variables not set for ${zoomAccount}`);
    }

    // Make a POST request to Zoom's OAuth token endpoint
    const response = await axios.post(
      'https://zoom.us/oauth/token',
      qs.stringify({ grant_type: 'account_credentials', account_id: accountId }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
      }
    );

    return response.data.access_token;
  } catch (error: any) {
    console.error(`Error generating Zoom token for ${zoomAccount}:`, error.response?.data || error.message);
    throw new Error('Failed to generate Zoom token');
  }
};

export default generateZoomToken;
