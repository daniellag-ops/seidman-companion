// Embryo melody: Gemini Vision analysis → music prompt → Lyria generation
// Note: requires Vercel Pro (maxDuration: 60) — music generation can take 20-40s

export const config = { maxDuration: 60 };

async function getEdgeConfigItem(key) {
  const url = `https://edge-config.vercel.com/${process.env.EDGE_CONFIG_ID}/item/${key}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.EDGE_CONFIG_TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}

async function analyzeEmbryo(imageBase64, mimeType, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: `You are a compassionate IVF embryologist. Analyze this embryo image and describe:
1. Development stage (Day 1–6, or blastocyst stage if applicable)
2. Approximate cell count if visible
3. Morphology impression (excellent / good / fair)
4. One warm, encouraging sentence for the patient about what you observe

Be specific and warm. If the image is unclear, describe what you can see. Keep it under 100 words.` }
          ]
        }]
      })
    }
  );
  if (!res.ok) throw new Error(`Vision API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No analysis returned from vision model');
  return text;
}

function buildMusicPrompt(analysis) {
  const lower = analysis.toLowerCase();
  let character = 'gentle and tender, like the quiet beginning of something precious';
  let palette = 'solo piano with soft harp accents and warm cello';
  let tempo = '62';

  if (lower.includes('blastocyst') || lower.includes('day 5') || lower.includes('day 6')) {
    character = 'expansive and hopeful, celebrating advanced development and possibility';
    palette = 'piano, strings ensemble, light celesta, soft choir texture';
    tempo = '70';
  } else if (lower.includes('excellent') || lower.includes('perfect') || lower.includes('beautiful')) {
    character = 'warm and luminous, full of quiet joy and wonder';
    palette = 'piano with golden harp, gentle strings, soft triangle';
    tempo = '67';
  } else if (lower.includes('day 3') || lower.includes('8-cell') || lower.includes('8 cell')) {
    character = 'delicate and rhythmic, like a heartbeat finding its pace';
    palette = 'piano, pizzicato strings, soft marimba';
    tempo = '65';
  }

  return `A personal melody for an IVF journey. ${character}. Instrumentation: ${palette}. Tempo: ${tempo} BPM. Major key. Approximately 30 seconds. Instrumental only. Chamber music quality — intimate, warm, deeply human. This piece celebrates new life and the hope carried in every embryo.`;
}

async function generateMusic(prompt, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/lyria-002:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Music API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.[0];
  if (part?.inlineData?.data) {
    return { audioBase64: part.inlineData.data, audioMimeType: part.inlineData.mimeType || 'audio/wav' };
  }
  throw new Error('No audio data in music API response. The Lyria model may not be available on your API key.');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, mimeType, token } = req.body;
  if (!imageBase64 || !mimeType || !token) return res.status(400).json({ error: 'Missing fields' });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Google API key not configured' });

  try {
    const tokens = await getEdgeConfigItem('tokens') || {};
    if (!tokens[token] || tokens[token].active === false) return res.status(403).json({ error: 'Invalid token' });

    const analysis = await analyzeEmbryo(imageBase64, mimeType, apiKey);
    const musicPrompt = buildMusicPrompt(analysis);
    const { audioBase64, audioMimeType } = await generateMusic(musicPrompt, apiKey);

    return res.status(200).json({ analysis, audioBase64, audioMimeType });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
