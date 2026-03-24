async function getEdgeConfigItem(key) {
  const url = `https://edge-config.vercel.com/${process.env.EDGE_CONFIG_ID}/item/${key}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.EDGE_CONFIG_TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}

async function updateEdgeConfig(items) {
  return fetch(`https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${process.env.VERCEL_MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, id, summary, phase } = req.body;
  if (!token || !id || !summary) return res.status(400).json({ error: 'Missing fields' });

  try {
    const tokens = await getEdgeConfigItem('tokens') || {};
    if (!tokens[token] || tokens[token].active === false) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const shares = await getEdgeConfigItem('shares') || [];

    const entry = {
      id,
      summary,
      phase: phase || null,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    const updated = [entry, ...shares].slice(0, 100);
    await updateEdgeConfig([{ operation: 'upsert', key: 'shares', value: updated }]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
