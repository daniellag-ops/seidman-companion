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

async function logQuestion(token, phase, question) {
  try {
    const edgeConfig = createClient(process.env.EDGE_CONFIG);
    const entry = {
      id: Date.now().toString(),
      tokenHash: token ? token.split('-')[0] : 'unknown',
      phase,
      question,
      timestamp: new Date().toISOString()
    };
    const logs = await edgeConfig.get('logs') || [];
    logs.unshift(entry);
    const trimmed = logs.slice(0, 500);
    await fetch(
      `https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{ operation: 'upsert', key: 'logs', value: trimmed }]
        })
      }
    );
  } catch (err) {
    console.error('Logging failed:', err.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, phase, question: userQuestion, ...body } = req.body;

  if (!token) {
    return res.status(403).json({ error: "Invalid access link. Please contact Prof. Seidman's clinic for your personal link." });
  }

  try {
    const edgeConfig = createClient(process.env.EDGE_CONFIG);
    const tokens = await edgeConfig.get('tokens') || {};

    if (!tokens[token] || tokens[token].active === false) {
      return res.status(403).json({ error: "Invalid access link. Please contact Prof. Seidman's clinic for your personal link." });
    }

    if (isRateLimited(token)) {
      return res.status(429).json({ error: 'Daily limit reached. Please try again tomorrow.' });
    }

    // Log the question server-side
    if (userQuestion) {
      await logQuestion(token, phase, userQuestion);
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
