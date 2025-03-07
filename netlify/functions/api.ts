import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

const handler: Handler = async (event) => {
  // Get the Finnhub API key from environment variables
  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  if (!finnhubApiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    // Extract the endpoint from the path
    const path = event.path.replace('/.netlify/functions/api', '');
    const finnhubUrl = `https://finnhub.io/api/v1${path}`;

    // Add API key to URL
    const url = new URL(finnhubUrl);
    url.searchParams.append('token', finnhubApiKey);

    // Forward the request to Finnhub
    const response = await fetch(url.toString());
    const data = await response.json();

    return {
      statusCode: response.status,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch data from Finnhub' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
};

export { handler };