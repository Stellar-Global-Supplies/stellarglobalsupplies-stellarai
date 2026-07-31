# Stellar AI — Cloudflare Deployment Guide

Complete step-by-step from zero to live. Estimated time: ~30 minutes.

---

## Prerequisites

```bash
node --version    # need v18+
npm --version     # need v9+
```

Install Wrangler globally:
```bash
npm install -g wrangler
wrangler login    # opens browser → log in to your Cloudflare account
```

---

## Step 1 — Clone & install dependencies

```bash
git clone https://github.com/Stellar-Global-Supplies/stellarglobalsupplies-ai.git stellar-ai-cf
cd stellar-ai-cf

# Copy these new files into the repo root (replace the backend/ folder)
npm install
cd frontend && npm install && cd ..
cd worker   && npm install && cd ..
```

---

## Step 2 — Create D1 Database

```bash
wrangler d1 create stellar-ai-db
```

Copy the `database_id` from the output and paste it into `worker/wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "stellar-ai-db"
database_id = "PASTE_YOUR_ID_HERE"
```

Run the schema:
```bash
wrangler d1 execute stellar-ai-db --file=worker/schema.sql
```

Verify tables created:
```bash
wrangler d1 execute stellar-ai-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

---

## Step 3 — Set Worker secrets

Run each of these (you'll be prompted to paste the value):

```bash
cd worker

wrangler secret put GROQ_API_KEY
# → paste your Groq API key from console.groq.com

wrangler secret put JWT_SECRET
# → paste your EXISTING JWT secret (same one your current auth uses to sign tokens)

wrangler secret put NEON_DATABASE_URL
# → paste your Neon connection string (for ent data toggle)
# format: postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require

wrangler secret put TAVILY_API_KEY
# → paste your Tavily API key from app.tavily.com

wrangler secret put GRADIO_URL
# → paste your Gradio space URL, e.g. https://your-space.hf.space

wrangler secret put ALLOWED_ORIGIN
# → paste your Pages URL (set this AFTER step 5, or use * for now)
# e.g. https://stellar-ai.pages.dev
```

---

## Step 4 — Deploy the Worker

```bash
cd worker
wrangler deploy
```

You'll get a URL like: `https://stellar-ai-worker.YOUR_SUBDOMAIN.workers.dev`

Test it:
```bash
curl https://stellar-ai-worker.YOUR_SUBDOMAIN.workers.dev/api/health
# → {"ok":true,"ts":1234567890}
```

---

## Step 5 — Deploy the Frontend to Cloudflare Pages

### Option A: GitHub integration (recommended — auto-deploys on push)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages** → **Create a project**
2. Connect your GitHub account → select `stellarglobalsupplies-ai` repo
3. Set build settings:
   - **Framework preset**: Vite
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Build output directory**: `frontend/dist`
4. Add environment variable:
   - `VITE_WORKER_URL` = `https://stellar-ai-worker.YOUR_SUBDOMAIN.workers.dev`
5. Click **Save and Deploy**

Every push to `main` now auto-deploys. ✓

### Option B: Manual deploy via CLI

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local — set VITE_WORKER_URL to your Worker URL

npm run build
npx wrangler pages deploy dist --project-name stellar-ai
```

---

## Step 6 — Update ALLOWED_ORIGIN secret

Once you have your Pages URL (e.g. `https://stellar-ai.pages.dev`):

```bash
cd worker
wrangler secret put ALLOWED_ORIGIN
# → paste: https://stellar-ai.pages.dev
wrangler deploy   # redeploy to pick up new secret
```

---

## Step 7 — Local development

Worker (port 8787):
```bash
cd worker

# Create local secrets file
cat > .dev.vars << EOF
GROQ_API_KEY=your_groq_key
JWT_SECRET=your_jwt_secret
NEON_DATABASE_URL=your_neon_url
TAVILY_API_KEY=your_tavily_key
GRADIO_URL=https://your-space.hf.space
ALLOWED_ORIGIN=http://localhost:3000
EOF

wrangler dev
```

Frontend (port 3000) — in a new terminal:
```bash
cd frontend
cp .env.example .env.local
# Set VITE_WORKER_URL=http://localhost:8787

npm run dev
```

Open http://localhost:3000

---

## Step 8 — Verify D1 cron cleanup

The cron `0 3 * * *` deletes messages older than 6 months daily at 3am UTC.

Test it manually:
```bash
wrangler d1 execute stellar-ai-db \
  --command="SELECT COUNT(*) as total FROM messages"
```

---

## Secrets reference

| Secret              | Where to get it                          |
|---------------------|------------------------------------------|
| `GROQ_API_KEY`      | console.groq.com → API Keys             |
| `JWT_SECRET`        | Your existing auth config                |
| `NEON_DATABASE_URL` | Neon dashboard → Connection string       |
| `TAVILY_API_KEY`    | app.tavily.com → API Keys               |
| `GRADIO_URL`        | huggingface.co → your Space URL         |
| `ALLOWED_ORIGIN`    | Your Cloudflare Pages URL               |

---

## Troubleshooting

**CORS errors** → Check `ALLOWED_ORIGIN` secret matches your Pages URL exactly (no trailing slash).

**401 Unauthorized** → JWT_SECRET must match exactly what your existing auth uses to sign tokens.

**D1 errors** → Confirm `database_id` in `wrangler.toml` matches what `wrangler d1 list` shows.

**Groq streaming not working locally** → Use `wrangler dev --local` not plain `wrangler dev`.

**File parse returns empty** → PDF may be scanned (image-based). Use text PDF or export data as CSV.

**XLSX not parsing** → Export to CSV in Excel first (File → Save As → CSV). Worker handles CSV natively.
