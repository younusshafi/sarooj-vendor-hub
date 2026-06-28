# Deployment — production architecture

Three independent pieces:

| Piece | Host | URL |
|---|---|---|
| Frontend (this app) | **Vercel** (Hobby) | `https://sarooj-vendor-hub-code.vercel.app` |
| Database + RPCs | **Supabase** (`fimfybfgjrbkcylmyekz`, schema `scc_procurement`) | called directly from the browser (anon key) |
| **BOQ parser** (PDF/Excel → JSON) | **VPS** `31.97.233.41` (same box as n8n) | `https://n8n.zavia-ai.com/boq` |

The parser **cannot run on Vercel** (Python + PyMuPDF + OpenAI vision; Hobby bans commercial use + 300s cap). It lives on the VPS permanently. The browser calls it directly; n8n is **not** in the parse path.

## BOQ parser service (VPS)

- Code: `/opt/boq-parser/` (venv + `api.py` + the 4 parser modules + `.env`). FastAPI/uvicorn on `127.0.0.1:8001`.
- **systemd:** unit `boq-parser.service` (`enabled` → starts on boot; `Restart=always` → auto-restarts on crash). Manage with `systemctl {status,restart} boq-parser`; logs `journalctl -u boq-parser -f`. `/opt/boq-parser/start.sh` now just runs `systemctl restart boq-parser`.
- **Public endpoint:** host **nginx** adds a `location /boq/` to the `n8n.zavia-ai.com` server (`/etc/nginx/sites-enabled/n8n`) → `proxy_pass http://127.0.0.1:8001/` (strips `/boq/`). Reuses n8n's Let's Encrypt cert. ⚠️ `sites-enabled/n8n` is a **real file, not a symlink** — edit it (not `sites-available`) and keep them in sync. Timestamped backups: `n8n.bak.<ts>`.
- **Security:** CORS locked (FastAPI `allow_origin_regex`) to `https://sarooj-vendor-hub-code*.vercel.app` + `http://localhost:*`. `/parse-*` require header **`X-BOQ-Key`** = `BOQ_API_KEY` in `/opt/boq-parser/.env` (fail-closed; `/health` stays open). nginx `limit_req zone=boq_rl` (20 req/min/IP, `/etc/nginx/conf.d/boq_ratelimit.conf`) caps OpenAI-cost abuse.
- Endpoints: `GET /boq/health` (open) · `POST /boq/parse-pdf` · `POST /boq/parse-xlsx` (both need the key).

## Frontend env vars

Set in **Vercel** (Project → Settings → Environment Variables, Production) and in **`.env.local`** for dev:

| Var | Required? | Value |
|---|---|---|
| `VITE_BOQ_API_KEY` | **yes** (parse fails without it) | the `BOQ_API_KEY` from the VPS `.env` |
| `VITE_BOQ_SERVICE_URL` | optional | defaults to `https://n8n.zavia-ai.com/boq` |

After setting Vercel env vars, **redeploy** (env changes need a new build). Vercel blocks unverified commits — a manual Redeploy may be needed.

> **Security note (Hobby):** `VITE_*` values are baked into the public JS bundle, so `VITE_BOQ_API_KEY` is **not truly secret** — it deters casual abuse; the real guards are the CORS origin-lock and the nginx rate-limit. To make it airtight, move to **Vercel Pro** and add a serverless proxy that holds the key server-side and checks the officer's Supabase session.

## Dev

The parser is public, so **no SSH tunnel is needed** anymore — `npm run dev` calls `https://n8n.zavia-ai.com/boq` directly (CORS allows localhost). Just put `VITE_BOQ_API_KEY` in `.env.local`. (You can still point the `/boq-tester` URL field at a local `http://localhost:8001` if you run the parser locally; that localStorage override wins.)

## Rotating the parser key

1. VPS: edit `BOQ_API_KEY` in `/opt/boq-parser/.env`, then `systemctl restart boq-parser`.
2. Vercel: update `VITE_BOQ_API_KEY`, redeploy.
