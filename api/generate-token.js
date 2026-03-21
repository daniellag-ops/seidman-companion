export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, adminKey } = req.body;

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!name) return res.status(400).json({ error: 'Patient name required' });

  // Create slug from full name e.g. "Sarah Cohen" → "sarah-cohen"
  const slug = name.trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const createdAt = new Date().toISOString();

  try {
    const readRes = await fetch(
      `https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`,
      { headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` } }
    );
    const existing = await readRes.json();
    const tokensItem = (existing.items || []).find(i => i.key === 'tokens');
    const currentTokens = tokensItem ? tokensItem.value : {};

    // Handle duplicate names by appending a number
    let finalSlug = slug;
    let counter = 2;
    while (currentTokens[finalSlug]) {
      finalSlug = `${slug}-${counter}`;
      counter++;
    }

    currentTokens[finalSlug] = { name, createdAt, active: true };

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

    return res.status(200).json({
      token: finalSlug,
      name,
      link: `https://seidman-ai.com/p/${finalSlug}`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
