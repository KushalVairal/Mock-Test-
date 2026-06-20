// api/generate-question.js
// Vercel serverless function. Accepts POST { topic, questionNumber }
// and returns { question, options: [4 strings], correct: 0-3, solution: string }.
//
// Uses Groq's free, fast inference API (Llama 3.3 70B) instead of Google
// Gemini. Requires the environment variable GROQ_API_KEY to be set in your
// Vercel project settings (Project -> Settings -> Environment Variables).

const MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

module.exports = async function handler(req, res) {
  // CORS headers
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfigured: GROQ_API_KEY is not set.' });
    return;
  }

  const qNum = Number.isFinite(questionNumber) ? questionNumber : 1;

  const systemPrompt = 'You are a strict JSON API for an exam question generator. ' +
    'You only ever respond with a single raw JSON object -- no markdown, no code fences, no commentary.';

  const userPrompt = `Generate ONE multiple-choice question for the exam topic: "${topic}".
This is question #${qNum} in a fresh practice set -- make it meaningfully different from a typical first question, and avoid repeating the most common textbook example every time.

Respond with STRICT JSON ONLY, matching exactly this shape:
{"question": "string", "options": ["string", "string", "string", "string"], "correct": 0, "solution": "string"}

Rules for LaTeX:
- If you need math, wrap it in single $...$ for inline or $$...$$ for display.
- Always use proper LaTeX syntax: e.g., $x^2$, $\frac{1}{2}$, $\sqrt{3}$, $\alpha$, $\beta$.
- NEVER use unescaped backslashes or commands outside $...$ delimiters.
- For simple fractions, write $\frac{a}{b}$ with braces exactly like that.
- Do NOT use \\text inside math unless absolutely necessary; keep it plain.

Other rules:
- "options" must contain exactly 4 distinct, plausible answer choices in random order.
- "correct" is the zero-based index (0-3) of the correct option within "options".
- "solution" must be a brief, clear explanation of why the correct answer is right (2-4 sentences, may include LaTeX if helpful).
- The question and answer must be factually accurate and appropriate for a serious exam candidate preparing for "${topic}".
- Do not reveal or hint at the answer inside the question text.
- Output raw JSON only, nothing else.`;

  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(502).json({
        error: 'Groq API request failed.',
        details: errText.slice(0, 500)
      });
      return;
    }

    const data = await upstream.json();
    const rawText = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;

    if (!rawText) {
      res.status(502).json({ error: 'Groq returned no usable content.' });
      return;
    }

    // Strip any accidental markdown code fences
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Fallback: extract first {...} block
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw parseErr;
      }
    }

    // Validate all fields, including the new "solution" field
    const valid = parsed &&
      typeof parsed.question === 'string' && parsed.question.trim() &&
      Array.isArray(parsed.options) && parsed.options.length === 4 &&
      parsed.options.every(o => typeof o === 'string' && o.trim()) &&
      typeof parsed.correct === 'number' &&
      parsed.correct >= 0 && parsed.correct <= 3 &&
      typeof parsed.solution === 'string' && parsed.solution.trim();

    if (!valid) {
      res.status(502).json({ error: 'Groq returned an unexpected question format.' });
      return;
    }

    // Return the full object with solution
    res.status(200).json({
      question: parsed.question,
      options: parsed.options,
      correct: parsed.correct,
      solution: parsed.solution
    });

  } catch (err) {
    res.status(500).json({
      error: 'Unexpected server error while generating the question.',
      details: String((err && err.message) || err)
    });
  }
};
