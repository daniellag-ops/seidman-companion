const tokenRequests = {};

function isRateLimited(token) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (!tokenRequests[token]) { tokenRequests[token] = { count: 1, resetAt: now + dayMs }; return false; }
  if (now > tokenRequests[token].resetAt) { tokenRequests[token] = { count: 1, resetAt: now + dayMs }; return false; }
  if (tokenRequests[token].count >= 20) return true;
  tokenRequests[token].count++;
  return false;
}

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

async function logQuestion(token, phase, question) {
  try {
    const logs = await getEdgeConfigItem('logs') || [];
    const entry = { id: Date.now().toString(), tokenHash: token?.split('-')[0] || 'unknown', phase, question, timestamp: new Date().toISOString() };
    const trimmed = [entry, ...logs].slice(0, 500);
    await updateEdgeConfig([{ operation: 'upsert', key: 'logs', value: trimmed }]);
  } catch (err) {
    console.error('Logging failed:', err.message);
  }
}

async function extractAndSaveMemory(token, phase, question, answer) {
  try {
    // Ask Claude to extract key clinical facts silently
    const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Extract key clinical facts from this IVF patient interaction as a brief 2-3 sentence summary. Include: treatment phase, any numbers mentioned (hormone levels, follicle counts, embryo grades, dates), and emotional state if relevant. Be concise and factual. If nothing clinically significant, return "No new facts."

Phase: ${phase}
Patient question: ${question}
Clinical response: ${answer}

Return only the summary, nothing else.`
        }]
      })
    });

    const extractData = await extractRes.json();
    const extracted = extractData.content?.[0]?.text?.trim();

    if (!extracted || extracted === 'No new facts.') return;

    // Load existing memory
    const allMemory = await getEdgeConfigItem('patient_memory') || {};
    const patientMemory = allMemory[token] || { facts: [], notes: [] };

    // Add new fact with timestamp
    patientMemory.facts = [
      { text: extracted, phase, date: new Date().toISOString().split('T')[0] },
      ...(patientMemory.facts || [])
    ].slice(0, 20); // keep last 20 facts

    allMemory[token] = patientMemory;
    await updateEdgeConfig([{ operation: 'upsert', key: 'patient_memory', value: allMemory }]);
  } catch (err) {
    console.error('Memory extraction failed:', err.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, phase, question, ...body } = req.body;

  if (!token) return res.status(403).json({ error: "Invalid access link. Please contact Prof. Seidman's clinic for your personal link." });

  try {
    const tokens = await getEdgeConfigItem('tokens') || {};

    if (!tokens[token] || tokens[token].active === false) {
      return res.status(403).json({ error: "Invalid access link. Please contact Prof. Seidman's clinic for your personal link." });
    }

    if (isRateLimited(token)) return res.status(429).json({ error: 'Daily limit reached. Please try again tomorrow.' });

    // Load patient memory and inject into system prompt
    const allMemory = await getEdgeConfigItem('patient_memory') || {};
    const patientMemory = allMemory[token];

    let memoryContext = '';
    if (patientMemory?.facts?.length || patientMemory?.notes?.length) {
      const facts = (patientMemory.facts || []).slice(0, 5).map(f => `- ${f.date}: ${f.text}`).join('\n');
      const notes = (patientMemory.notes || []).slice(0, 3).map(n => `- ${n.date}: ${n.text}`).join('\n');
      memoryContext = `\n\nPATIENT HISTORY (use this to personalize your response):\n${facts}${notes ? '\n\nPatient notes:\n' + notes : ''}`;
    }

    // Inject memory into system prompt
    if (body.system && memoryContext) {
      body.system = body.system + memoryContext;
    }

    // Log question
    if (question) logQuestion(token, phase, question);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    // Extract and save memory in background (don't await — don't slow down response)
    if (question && data.content?.[0]?.text) {
      extractAndSaveMemory(token, phase, question, data.content[0].text);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
