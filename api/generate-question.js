// api/generate-question.js
// Vercel serverless function. Accepts POST { topic, questionNumber }
// and returns { question, options: [4 strings], correct: 0-3 }.
//
// Requires the environment variable GEMINI_API_KEY to be set in your
// Vercel project settings (Project -> Settings -> Environment Variables).

// "gemini-2.5-flash" is a good balance of quality and free-tier quota as of
// 2026. If you need a higher daily request limit and don't mind slightly
// simpler questions, swap this to "gemini-2.5-flash-lite". Free-tier quotas
// change over time -- check https://ai.google.dev/gemini-api/docs/rate-limits
// if you start seeing 429 errors.
const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

module.exports = async function handler(req, res) {
  // Allow the frontend to call this even if it's hosted on a different
  // origin (e.g. GitHub Pages). Safe to remove if frontend + backend share
  // the same Vercel project/domain.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const { topic, questionNumber } = req.body || {};

  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    res.status(400).json({ error: 'Missing or invalid "topic" field.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY is not set.' });
    return;
  }

  const qNum = Number.isFinite(questionNumber) ? questionNumber : 1;

  const prompt = `You are an exam question generator for the topic: "${topic}".
Generate ONE multiple-choice question (this is question #${qNum} in a fresh practice set -- make it different from a typical first question, and do not repeat common textbook examples every time).
Respond with STRICT JSON ONLY. No markdown formatting, no code fences, no commentary before or after -- just the raw JSON object, matching exactly this shape:
{"question": "string", "options": ["string", "string", "string", "string"], "correct": 0}

Rules:
- "options" must contain exactly 4 distinct, plausible answer choices in random order.
- "correct" is the zero-based index (0-3) of the correct option within "options".
- The question and answer must be factually accurate and appropriate for a serious exam candidate preparing for "${topic}".
- Do not reveal or hint at the answer inside the question text.
- Output raw JSON only, nothing else.`;

  try {
    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 500
        }
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(502).json({
        error: 'Gemini API request failed.',
        details: errText.slice(0, 500)
      });
      return;
    }

    const data = await upstream.json();
    const rawText = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

    if (!rawText) {
      res.status(502).json({ error: 'Gemini returned no usable content.' });
      return;
    }

    // Strip markdown code fences if the model added them despite instructions.
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Fallback: try to pull out the first {...} block.
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw parseErr;
      }
    }

    const valid = parsed &&
      typeof parsed.question === 'string' && parsed.question.trim() &&
      Array.isArray(parsed.options) && parsed.options.length === 4 &&
      parsed.options.every(o => typeof o === 'string' && o.trim()) &&
      typeof parsed.correct === 'number' &&
      parsed.correct >= 0 && parsed.correct <= 3;

    if (!valid) {
      res.status(502).json({ error: 'Gemini returned an unexpected question format.' });
      return;
    }

    res.status(200).json({
      question: parsed.question,
      options: parsed.options,
      correct: parsed.correct
    });

  } catch (err) {
    res.status(500).json({
      error: 'Unexpected server error while generating the question.',
      details: String((err && err.message) || err)
    });
  }
};
