async function getEdgeConfigItem(key) {
  const url = `https://edge-config.vercel.com/${process.env.EDGE_CONFIG_ID}/item/${key}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.EDGE_CONFIG_TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const [logs, tokens, shares] = await Promise.all([
      getEdgeConfigItem('logs').then(r => r || []),
      getEdgeConfigItem('tokens').then(r => r || {}),
      getEdgeConfigItem('shares').then(r => r || [])
    ]);

    const phaseCounts = {};
    logs.forEach(l => { if (l.phase) phaseCounts[l.phase] = (phaseCounts[l.phase] || 0) + 1; });

    const uniqueUsers = new Set(logs.map(l => l.tokenHash)).size;

    const patients = Object.entries(tokens)
      .map(([slug, v]) => ({ slug, name: v.name, createdAt: v.createdAt, active: v.active !== false }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      totalQuestions: logs.length,
      uniqueUsers,
      totalPatients: Object.keys(tokens).length,
      totalShares: shares.length,
      phaseCounts,
      patients,
      logs: logs.map(l => ({ phase: l.phase, question: l.question, timestamp: l.timestamp })),
      shares: shares.slice(0, 50)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
