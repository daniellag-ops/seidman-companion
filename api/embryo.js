export const config = { maxDuration: 60 };

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('[embryo] GOOGLE_API_KEY not set');
    return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
  }

  const { imageData, mimeType, lang } = req.body || {};
  if (!imageData || !mimeType) {
    console.error('[embryo] Missing imageData or mimeType');
    return res.status(400).json({ error: 'Missing imageData or mimeType' });
  }

  console.log(`[embryo] lang=${lang}, mimeType=${mimeType}, dataLen=${imageData.length}`);

  const isHe = lang === 'he';

  const prompt = isHe
    ? `אתה עוזר רפואי המתמחה בעוברולוגיה. תפקידך לנתח את תמונת העובר ולכתוב שיר קצר ומרגש.

ראשית נתח את התמונה: שלב ההתפתחות (2-cell, 4-cell, morula, blastocyst וכו׳), מספר התאים הנראה, סימטריה ואיכות כללית.

לאחר מכן כתוב שיר בעברית בן 4-6 שורות על העובר הספציפי הזה. השיר צריך להיות חם, מלא תקווה ואישי — מבוסס על מה שאתה רואה בתמונה. תן לשיר להרגיש כמו לחישה לחיים שמתחילים.

החזר JSON בלבד ללא markdown, בפורמט הזה בדיוק:
{"analysis":"תיאור קצר של העובר","poem":"שורה 1\nשורה 2\nשורה 3\nשורה 4"}`
    : `You are a medical assistant specializing in embryology. Your task is to analyze the embryo image and write a short, beautiful poem.

First analyze the image: developmental stage (2-cell, 4-cell, morula, blastocyst, etc.), visible cell count, symmetry, and overall quality.

Then write a poem in English of 4-6 lines about this specific embryo — warm, hopeful, and personal, based on what you see. Let it feel like a whisper to a life just beginning.

Return JSON only, no markdown, in exactly this format:
{"analysis":"brief embryo description","poem":"line 1\nline 2\nline 3\nline 4"}`;

  try {
    const r = await fetch(`${GEMINI_BASE}/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imageData } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.9 }
      })
    });

    console.log(`[embryo] Gemini status: ${r.status}`);
    const json = await r.json();

    if (!r.ok) {
      console.error('[embryo] Gemini error:', JSON.stringify(json));
      return res.status(502).json({ error: `Gemini Vision error: ${json?.error?.message || r.status}` });
    }

    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[embryo] Raw response: ${raw.slice(0, 200)}`);

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[embryo] JSON parse failed:', cleaned);
      return res.status(502).json({ error: 'Could not parse Gemini response as JSON' });
    }

    if (!parsed.poem) {
      console.error('[embryo] No poem in response:', parsed);
      return res.status(502).json({ error: 'Gemini did not return a poem' });
    }

    console.log(`[embryo] Success — poem: ${parsed.poem.slice(0, 80)}`);
    return res.status(200).json({ poem: parsed.poem, analysis: parsed.analysis || '' });

  } catch (err) {
    console.error('[embryo] Fetch error:', err);
    return res.status(502).json({ error: `Request failed: ${err.message}` });
  }
}
