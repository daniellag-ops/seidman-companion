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

  const { token, note, dates, medications, medLog } = req.body;
  if (!token || (!note && !dates && !medications && !medLog)) return res.status(400).json({ error: 'Missing fields' });

  try {
    // Validate token
    const tokens = await getEdgeConfigItem('tokens') || {};
    if (!tokens[token] || tokens[token].active === false) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const allMemory = await getEdgeConfigItem('patient_memory') || {};
    const patientMemory = allMemory[token] || { facts: [], notes: [] };

    if (note) {
      patientMemory.notes = [
        { text: note, date: new Date().toISOString().split('T')[0] },
        ...(patientMemory.notes || [])
      ].slice(0, 20);
    }

    if (dates) {
      patientMemory.dates = { ...patientMemory.dates, ...dates };
    }

    if (medications !== undefined) {
      patientMemory.medications = medications;
    }

    if (medLog) {
      if (!patientMemory.medLogs) patientMemory.medLogs = {};
      patientMemory.medLogs[medLog.date] = medLog.logs;
      // Keep last 30 days of logs
      const keys = Object.keys(patientMemory.medLogs).sort().reverse().slice(0, 30);
      patientMemory.medLogs = Object.fromEntries(keys.map(k => [k, patientMemory.medLogs[k]]));
    }

    allMemory[token] = patientMemory;
    await updateEdgeConfig([{ operation: 'upsert', key: 'patient_memory', value: allMemory }]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
