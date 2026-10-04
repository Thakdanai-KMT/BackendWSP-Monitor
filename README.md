# BackendWSP Monitor — Cloudflare Worker

This replaces the GitHub Actions scheduler with a Cloudflare Worker Cron Trigger.

Schedule:
- Every 5 minutes (`*/5 * * * *`)
- Cron expressions run in UTC.

The Worker:
1. Checks BackendWSP `/api/health`
2. Reads the previous state from Supabase `monitor_status`
3. Sends a Discord Embed only on first run or when status changes
4. Saves the new state to Supabase

Secrets are configured in Cloudflare, not committed to Git.

## Required secrets

- BACKEND_URL
- DISCORD_WEBHOOK_URL
- SUPABASE_URL
- SUPABASE_SECRET_KEY

Optional:
- MONITOR_SEND_INITIAL=true

## Local setup

```bash
npm install
npx wrangler login
```

For local testing, create `.dev.vars` with the same variables as `.env.example`, then:

```bash
npm run dev
```

Deploy:

```bash
npm run typecheck
npm run deploy
```

After deployment, verify the Cron Trigger in the Cloudflare dashboard.
