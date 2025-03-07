import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

const handler: Handler = async (event) => {
  // Get the Finnhub API key from environment variables
  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  if (!finnhubApiKey) {
    console.error('Missing FINNHUB_API_KEY environment variable');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    };
  }

  // Handle OPTIONS requests for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
      },
      body: ''
    };
  }

  try {
    // Extract the endpoint from the path
    const path = event.path.replace('/.netlify/functions/api', '');
    const finnhubUrl = `https://finnhub.io/api/v1${path}`;
    console.log(`Proxying request to: ${finnhubUrl}`);

    // Add API key to URL
    const url = new URL(finnhubUrl);
    url.searchParams.append('token', finnhubApiKey);

    // Forward the request to Finnhub
    console.log('Making request to Finnhub API...');
    const response = await fetch(url.toString());
    const data = await response.json();

    console.log(`Finnhub API response status: ${response.status}`);

    return {
      statusCode: response.status,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    };
  } catch (error) {
    console.error('Error proxying request to Finnhub:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch data from Finnhub',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    };
  }
};

export { handler };