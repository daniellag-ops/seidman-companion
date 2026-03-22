import { createClient } from '@vercel/edge-config';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, phase, question } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing fields' });

  try {
    const edgeConfig = createClient(process.env.EDGE_CONFIG);

    // Build log entry — no patient name, just anonymous usage data
    const entry = {
      id: Date.now().toString(),
      tokenHash: token ? token.split('-')[0] : 'unknown', // only first segment, not full token
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
