// Consolidated data API
// Actions: get-memory, save-memory, add-reminder, save-share, get-share,
//          deactivate-patient, reactivate-patient

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

async function handleGetMemory(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const tokens = await getEdgeConfigItem('tokens') || {};
  if (!tokens[token] || tokens[token].active === false) return res.status(403).json({ error: 'Invalid token' });
  const memory = await getEdgeConfigItem('pm_' + token) || { facts: [], notes: [] };
  return res.status(200).json(memory);
}

async function handleSaveMemory(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, note, dates, medications, medLog, acknowledgeReminder } = req.body;
  if (!token || (!note && !dates && !medications && !medLog && !acknowledgeReminder)) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const tokens = await getEdgeConfigItem('tokens') || {};
  if (!tokens[token] || tokens[token].active === false) return res.status(403).json({ error: 'Invalid token' });

  const memory = await getEdgeConfigItem('pm_' + token) || { facts: [], notes: [] };

  if (note) {
    memory.notes = [{ text: note, date: new Date().toISOString().split('T')[0] }, ...(memory.notes || [])].slice(0, 20);
  }
  if (dates) memory.dates = { ...memory.dates, ...dates };
  if (medications !== undefined) memory.medications = medications;
  if (acknowledgeReminder && memory.reminders) {
    const r = memory.reminders.find(r => r.id === acknowledgeReminder);
    if (r) { r.acknowledged = true; r.acknowledgedAt = new Date().toISOString(); }
  }
  if (medLog) {
    if (!memory.medLogs) memory.medLogs = {};
    memory.medLogs[medLog.date] = medLog.logs;
    const keys = Object.keys(memory.medLogs).sort().reverse().slice(0, 30);
    memory.medLogs = Object.fromEntries(keys.map(k => [k, memory.medLogs[k]]));
  }

  await updateEdgeConfig([{ operation: 'upsert', key: 'pm_' + token, value: memory }]);
  return res.status(200).json({ ok: true });
}

async function handleAddReminder(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { adminKey, token, message, type } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  if (!token || !message) return res.status(400).json({ error: 'Missing fields' });

  const tokens = await getEdgeConfigItem('tokens') || {};
  if (!tokens[token]) return res.status(404).json({ error: 'Patient not found' });

  const memory = await getEdgeConfigItem('pm_' + token) || { facts: [], notes: [] };
  if (!memory.reminders) memory.reminders = [];
  memory.reminders.unshift({ id: Date.now().toString(), type: type || 'appointment', message, createdAt: new Date().toISOString(), acknowledged: false });
  memory.reminders = memory.reminders.slice(0, 20);

  const writeRes = await updateEdgeConfig([{ operation: 'upsert', key: 'pm_' + token, value: memory }]);
  if (!writeRes.ok) throw new Error(`Edge Config write failed (${writeRes.status})`);
  return res.status(200).json({ ok: true });
}

async function handleSaveShare(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, id, summary, phase } = req.body;
  if (!token || !id || !summary) return res.status(400).json({ error: 'Missing fields' });

  const tokens = await getEdgeConfigItem('tokens') || {};
  if (!tokens[token] || tokens[token].active === false) return res.status(403).json({ error: 'Invalid token' });

  const shares = await getEdgeConfigItem('shares') || [];
  const entry = { id, summary, phase: phase || null, date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString() };
  await updateEdgeConfig([{ operation: 'upsert', key: 'shares', value: [entry, ...shares].slice(0, 100) }]);
  return res.status(200).json({ ok: true });
}

async function handleGetShare(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  const shares = await getEdgeConfigItem('shares') || [];
  const share = shares.find(s => s.id === id);
  if (!share) return res.status(404).json({ error: 'Not found' });
  return res.status(200).json(share);
}

async function handleDeactivatePatient(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { adminKey, token } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const tokens = await getEdgeConfigItem('tokens') || {};
  if (!tokens[token]) return res.status(404).json({ error: 'Patient not found' });
  tokens[token].active = false;
  const writeRes = await updateEdgeConfig([{ operation: 'upsert', key: 'tokens', value: tokens }]);
  if (!writeRes.ok) throw new Error(`Edge Config write failed (${writeRes.status})`);
  return res.status(200).json({ ok: true });
}

async function handleReactivatePatient(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { adminKey, token } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const tokens = await getEdgeConfigItem('tokens') || {};
  if (!tokens[token]) return res.status(404).json({ error: 'Patient not found' });
  tokens[token].active = true;
  const writeRes = await updateEdgeConfig([{ operation: 'upsert', key: 'tokens', value: tokens }]);
  if (!writeRes.ok) throw new Error(`Edge Config write failed (${writeRes.status})`);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.method === 'GET' ? req.query.action : req.body?.action;

  try {
    switch (action) {
      case 'get-memory':          return await handleGetMemory(req, res);
      case 'save-memory':         return await handleSaveMemory(req, res);
      case 'add-reminder':        return await handleAddReminder(req, res);
      case 'save-share':          return await handleSaveShare(req, res);
      case 'get-share':           return await handleGetShare(req, res);
      case 'deactivate-patient':  return await handleDeactivatePatient(req, res);
      case 'reactivate-patient':  return await handleReactivatePatient(req, res);
      default:                    return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
