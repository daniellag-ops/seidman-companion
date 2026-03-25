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

  const { imageData, mimeType } = req.body || {};
  if (!imageData || !mimeType) {
    console.error('[embryo] Missing imageData or mimeType');
    return res.status(400).json({ error: 'Missing imageData or mimeType' });
  }

  console.log(`[embryo] Received ${mimeType}, data length: ${imageData.length}`);

  // ── Step 1: Gemini Vision analysis ──
  let analysis = '';
  try {
    const visionRes = await fetch(`${GEMINI_BASE}/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: { mimeType, data: imageData }
            },
            {
              text: 'You are an embryologist. Describe what you see in this embryo image or video frame: the developmental stage (e.g. 2-cell, 4-cell, morula, blastocyst), approximate cell count, symmetry, and overall quality (poor/fair/good/excellent). Be concise — 2–3 sentences. If this does not appear to be an embryo image, say so.'
            }
          ]
        }]
      })
    });

    console.log(`[embryo] Vision API status: ${visionRes.status}`);
    const visionJson = await visionRes.json();

    if (!visionRes.ok) {
      console.error('[embryo] Vision API error:', JSON.stringify(visionJson));
      return res.status(502).json({ error: `Gemini Vision error: ${visionJson?.error?.message || visionRes.status}` });
    }

    analysis = visionJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[embryo] Analysis: ${analysis}`);

    if (!analysis) {
      return res.status(502).json({ error: 'Gemini Vision returned no analysis' });
    }
  } catch (err) {
    console.error('[embryo] Vision fetch error:', err);
    return res.status(502).json({ error: `Vision request failed: ${err.message}` });
  }

  // ── Step 2: Build music prompt ──
  const musicPrompt = `Create a gentle, hopeful 30-second instrumental piece inspired by this embryology description: "${analysis}".
The music should feel like new life beginning — tender, warm, and quietly miraculous.
Use soft piano, gentle strings, and subtle ambient textures.
The mood should be intimate and emotionally resonant, like a lullaby for something just beginning to exist.`;

  console.log(`[embryo] Music prompt built, calling Lyria...`);

  // ── Step 3: Lyria music generation ──
  try {
    const lyriaRes = await fetch(`${GEMINI_BASE}/models/lyria-002:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: musicPrompt }]
        }],
        generationConfig: {
          responseModalities: ['AUDIO']
        }
      })
    });

    console.log(`[embryo] Lyria API status: ${lyriaRes.status}`);
    const lyriaJson = await lyriaRes.json();

    if (!lyriaRes.ok) {
      console.error('[embryo] Lyria API error:', JSON.stringify(lyriaJson));
      return res.status(502).json({
        error: `Music generation error: ${lyriaJson?.error?.message || lyriaRes.status}`,
        analysis
      });
    }

    console.log('[embryo] Lyria response keys:', Object.keys(lyriaJson));

    const audioPart = lyriaJson?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!audioPart) {
      console.error('[embryo] No audio in Lyria response:', JSON.stringify(lyriaJson).slice(0, 500));
      return res.status(502).json({
        error: 'Lyria returned no audio data',
        analysis
      });
    }

    const audioBase64 = audioPart.inlineData.data;
    const audioMime = audioPart.inlineData.mimeType || 'audio/wav';

    console.log(`[embryo] Audio received: ${audioMime}, length: ${audioBase64.length}`);

    return res.status(200).json({ analysis, audioBase64, audioMime });

  } catch (err) {
    console.error('[embryo] Lyria fetch error:', err);
    return res.status(502).json({
      error: `Music generation request failed: ${err.message}`,
      analysis
    });
  }
}
