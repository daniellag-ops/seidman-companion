import { createClient } from '@vercel/edge-config';

// Per-token rate limiter: 20 requests per token per day
const tokenRequests = {};

function isRateLimited(token) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (!tokenRequests[token]) {
    tokenRequests[token] = { count: 1, resetAt: now + dayMs };
    return false;
  }
  if (now > tokenRequests[token].resetAt) {
    tokenRequests[token] = { count: 1, resetAt: now + dayMs };
    return false;
  }
  if (tokenRequests[token].count >= 20) return true;
  tokenRequests[token].count++;
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, ...body } = req.body;

  if (!token) {
    return res.status(403).json({ error: "Invalid access link. Please contact Prof. Seidman's clinic for your personal link." });
  }

  try {
    // Validate token against Edge Config
    const edgeConfig = createClient(process.env.EDGE_CONFIG);
    const tokens = await edgeConfig.get('tokens') || {};

    if (!tokens[token] || tokens[token].active === false) {
      return res.status(403).json({ error: "Invalid access link. Please contact Prof. Seidman's clinic for your personal link." });
    }

    if (isRateLimited(token)) {
      return res.status(429).json({ error: 'Daily limit reached. Please try again tomorrow.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
