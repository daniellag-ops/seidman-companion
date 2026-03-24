async function getEdgeConfigItem(key) {
  const url = `https://edge-config.vercel.com/${process.env.EDGE_CONFIG_ID}/item/${key}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.EDGE_CONFIG_TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const shares = await getEdgeConfigItem('shares') || [];
    const share = shares.find(s => s.id === id);
    if (!share) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(share);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
