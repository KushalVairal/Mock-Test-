# Mock Exam Hall — AI Mock Test

A free, AI-powered mock test app. Enter any exam topic (e.g. "UPSC Polity",
"IBPS SO IT Officer", "NEET Biology") and it generates fresh multiple-choice
questions on the fly using Google's free Gemini API.

```
ai-mock-test/
├── index.html              ← frontend (HTML + CSS + JS, no build step)
├── api/
│   └── generate-question.js ← serverless function that calls Gemini
├── package.json
└── .gitignore
```

The simplest setup hosts **both** the frontend and the backend on the same
Vercel project, so there's only one URL, no CORS, and no separate GitHub
Pages step. That's what these steps walk through.

---

## 1. Get a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey).
2. Click **Create API Key**. No credit card required.
3. Copy the key somewhere safe — you'll paste it into Vercel in step 3.

Free-tier quotas change over time (they were cut back in Dec 2025), so treat
any specific numbers as approximate. Check
[ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)
for current limits. As of mid-2026, `gemini-2.5-flash` (used in this project)
gets roughly 10 requests/minute and a few hundred requests/day for free —
plenty for personal or classroom use. If you outgrow it, open
`api/generate-question.js` and change `MODEL` to `gemini-2.5-flash-lite` for
a higher daily limit.

## 2. Push the project to GitHub

```bash
cd ai-mock-test
git init
git add .
git commit -m "Initial commit"
```

Create a new repository on GitHub (public or private both work), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

## 3. Deploy on Vercel

1. Sign up at [vercel.com](https://vercel.com) using your GitHub account.
2. Click **Add New… → Project** and import the repository you just pushed.
3. Vercel will auto-detect `index.html` as a static file and
   `api/generate-question.js` as a serverless function — no build
   configuration needed.
4. Before deploying, open **Environment Variables** and add:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** the key you copied in step 1
5. Click **Deploy**. After a minute you'll get a live URL like
   `https://ai-mock-test-yourname.vercel.app`.

That's it — open that URL and the app is live. Because `index.html` calls
`/api/generate-question` as a relative path, it automatically reaches the
serverless function on the same domain.

## 4. (Optional) Test locally first

```bash
npm install -g vercel
vercel dev
```

This runs the same setup locally (usually at `http://localhost:3000`) using
a `.env.local` file for `GEMINI_API_KEY` instead of Vercel's dashboard.

## 5. (Optional) Host the frontend somewhere else

If you'd rather host `index.html` separately (e.g. GitHub Pages) and keep
only the API on Vercel:

1. Deploy just the `api/` folder + `package.json` to Vercel as above.
2. In `index.html`, change:
   ```js
   const API_URL = '/api/generate-question';
   ```
   to your full Vercel URL:
   ```js
   const API_URL = 'https://your-app.vercel.app/api/generate-question';
   ```
3. Push `index.html` to a repo, then in its GitHub **Settings → Pages**,
   set the source to the `main` branch / root folder.

This adds a CORS hop (already handled by the `Access-Control-Allow-Origin`
header in `generate-question.js`), so it works, but the single-Vercel-project
setup in steps 1–3 is simpler.

---

## Notes

- Nothing is stored server-side — each question is generated fresh and
  answers live only in the browser tab for the duration of the test.
- If Gemini's response can't be parsed as valid JSON, the function returns a
  502 with an error message rather than guessing; the frontend then ends the
  test gracefully and shows whatever results were collected so far.
- To change the pass/fail threshold on the results screen, edit the `0.5`
  cutoff inside the `showResults()` function in `index.html`.
