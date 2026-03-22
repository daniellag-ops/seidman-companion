import { createClient } from '@vercel/edge-config';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const edgeConfig = createClient(process.env.EDGE_CONFIG);
    const logs = await edgeConfig.get('logs') || [];
    const tokens = await edgeConfig.get('tokens') || {};

    // Phase counts
    const phaseCounts = {};
    logs.forEach(l => {
      if (l.phase) phaseCounts[l.phase] = (phaseCounts[l.phase] || 0) + 1;
    });

    // Unique users by tokenHash
    const uniqueUsers = new Set(logs.map(l => l.tokenHash)).size;

    // Questions per day (last 14 days)
    const dailyCounts = {};
    logs.forEach(l => {
      const day = l.timestamp?.split('T')[0];
      if (day) dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    return res.status(200).json({
      totalQuestions: logs.length,
      uniqueUsers,
      totalPatients: Object.keys(tokens).length,
      phaseCounts,
      dailyCounts,
      logs: logs.map(l => ({
        phase: l.phase,
        question: l.question,
        timestamp: l.timestamp
        // no name, no token
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
