export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, adminKey } = req.body;

  // Protect the admin endpoint with a secret key
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!name) return res.status(400).json({ error: 'Patient name required' });

  // Generate a unique token
  const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const createdAt = new Date().toISOString();

  try {
    // Read existing tokens from Edge Config
    const readRes = await fetch(
      `https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`,
      { headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` } }
    );
    const existing = await readRes.json();
    const tokensItem = (existing.items || []).find(i => i.key === 'tokens');
    const currentTokens = tokensItem ? tokensItem.value : {};

    // Add new token
    currentTokens[token] = { name, createdAt, active: true };

    // Write back to Edge Config
    const writeRes = await fetch(
      `https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{ operation: 'upsert', key: 'tokens', value: currentTokens }]
        })
      }
    );

    if (!writeRes.ok) throw new Error('Failed to save token');

    return res.status(200).json({ token, name, link: `https://seidman-ai.com/?token=${token}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
