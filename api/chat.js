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

async function extractMemoryFact(phase, question) {
  try {
    // Detect language from content
    const isHebrew = /[\u0590-\u05FF]/.test(phase + question);
    const langInstruction = isHebrew
      ? 'כתבי משפט אחד חמה ואנושי בעברית המסכם מה עברה המטופלת כשסיפרה על כך. כתבי בגוף שני ("את..."). היי ספציפית לגבי מספרים או שלב הטיפול. עד 25 מילים. החזירי רק את המשפט.'
      : 'Write a single warm, human sentence in English summarizing what this IVF patient was going through. Write in second person ("You were..."). Be specific about any numbers or phase mentioned. Under 25 words. Return only the sentence.';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `${langInstruction}

Phase: ${phase}
Question: ${question}`
        }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch (err) {
    return null;
  }
}

async function saveMemoryFact(token, phase, question) {
  try {
    const fact = await extractMemoryFact(phase, question);
    if (!fact) return;

    const allMemory = await getEdgeConfigItem('patient_memory') || {};
    const patientMemory = allMemory[token] || { facts: [], notes: [] };

    patientMemory.facts = [
      { text: fact, phase, date: new Date().toISOString().split('T')[0] },
      ...(patientMemory.facts || [])
    ].slice(0, 20);

    allMemory[token] = patientMemory;
    await updateEdgeConfig([{ operation: 'upsert', key: 'patient_memory', value: allMemory }]);
  } catch (err) {
    console.error('Memory save failed:', err.message);
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
      const facts = (patientMemory.facts || []).slice(0, 5).map(f => `- ${f.date} [${f.phase}]: ${f.text}`).join('\n');
      const notes = (patientMemory.notes || []).slice(0, 3).map(n => `- ${n.date}: ${n.text}`).join('\n');
      memoryContext = `\n\nPATIENT HISTORY (use this to personalize your response):\n${facts}${notes ? '\n\nPatient notes:\n' + notes : ''}`;
    }

    if (body.system && memoryContext) {
      body.system = body.system + memoryContext;
    }

    // Log question and save memory in parallel
    const [response] = await Promise.all([
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      }),
      question ? logQuestion(token, phase, question) : Promise.resolve(),
      question ? saveMemoryFact(token, phase, question) : Promise.resolve()
    ]);

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
