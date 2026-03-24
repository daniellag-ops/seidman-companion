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

  const { adminKey, token } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    const tokens = await getEdgeConfigItem('tokens') || {};
    if (!tokens[token]) return res.status(404).json({ error: 'Patient not found' });

    tokens[token].active = false;

    const writeRes = await updateEdgeConfig([{ operation: 'upsert', key: 'tokens', value: tokens }]);
    if (!writeRes.ok) {
      const errBody = await writeRes.text();
      throw new Error(`Edge Config write failed (${writeRes.status}): ${errBody}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
