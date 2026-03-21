// Simple in-memory rate limiter: 20 requests per IP per day
const ipRequests = {};

function isRateLimited(ip) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (!ipRequests[ip]) {
    ipRequests[ip] = { count: 1, resetAt: now + dayMs };
    return false;
  }

  if (now > ipRequests[ip].resetAt) {
    ipRequests[ip] = { count: 1, resetAt: now + dayMs };
    return false;
  }

  if (ipRequests[ip].count >= 20) return true;

  ipRequests[ip].count++;
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Daily limit reached. Please try again tomorrow.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
