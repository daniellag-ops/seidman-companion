async function getEdgeConfigItem(key) {
  const url = `https://edge-config.vercel.com/${process.env.EDGE_CONFIG_ID}/item/${key}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.EDGE_CONFIG_TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    const tokens = await getEdgeConfigItem('tokens') || {};
    if (!tokens[token] || tokens[token].active === false) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const allMemory = await getEdgeConfigItem('patient_memory') || {};
    const patientMemory = allMemory[token] || { facts: [], notes: [] };

    return res.status(200).json(patientMemory);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
