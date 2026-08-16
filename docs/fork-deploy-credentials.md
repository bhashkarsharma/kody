# Deploy credentials — where to fill in

Everything below lives in the **GitHub repo settings**, not in this codebase.

**Fill-in location:** `https://github.com/bhashkarsharma/kody/settings/secrets/actions`
→ **Secrets and variables → Actions** (two tabs: *Secrets* and *Variables*).

Placeholders are already set. Replace each `YOUR_*` value with the real one.

## Required — Secrets tab

| Secret | Placeholder value | Where to get the real value |
|--------|-------------------|-----------------------------|
| `CLOUDFLARE_API_TOKEN` | `YOUR_CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens. Custom token with Edit on: Workers Scripts, D1, KV, R2, Queues, Vectorize, Workers AI, Analytics Engine |
| `AGENTMAIL_API_KEY` | `YOUR_AGENTMAIL_API_KEY` | https://console.agentmail.to (Account → API keys) |
| `COOKIE_SECRET` | *(real random value — already set, leave as-is)* | — |
| `SECRET_STORE_KEY` | *(real random value — already set, leave as-is)* | — |

## Required — Variables tab

| Variable | Placeholder value | Where to get the real value |
|----------|-------------------|-----------------------------|
| `CLOUDFLARE_ACCOUNT_ID` | `YOUR_CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar of any page ("Account ID") |
| `CLOUDFLARE_ZONE_ID` | `YOUR_CLOUDFLARE_ZONE_ID` | Cloudflare → your domain → Overview → right sidebar ("Zone ID") |
| `APP_BASE_URL` | `https://YOUR_DOMAIN.example.com` | The public HTTPS URL for the app (a domain you own, proxied by Cloudflare) |
| `AGENTMAIL_FROM` | `YOUR_INBOX@agentmail.to` | Your agentmail inbox address (the sender shown in outgoing mail) |

## Optional (leave unset to skip)

These are safe to leave unset — the deploy syncs them only if defined:

- **Secrets:** `OAUTH_GITHUB_CLIENT_ID` / `OAUTH_GITHUB_CLIENT_SECRET`, `OAUTH_GOOGLE_CLIENT_ID` / `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_X_CLIENT_ID` / `OAUTH_X_CLIENT_SECRET`, `KIT_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `AI_GATEWAY_ID`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `CAPABILITY_REINDEX_SECRET`
- **Variables:** `SENTRY_ORG`, `SENTRY_PROJECT`
- The `LEGACY_*`, `PACKAGE_APP_*`, `*_EMAIL_DOMAIN` variables default to empty and can stay unset.

## CLI alternative

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo bhashkarsharma/kody --body "<value>"
gh secret set AGENTMAIL_API_KEY --repo bhashkarsharma/kody --body "<value>"
gh variable set CLOUDFLARE_ACCOUNT_ID --repo bhashkarsharma/kody --body "<value>"
gh variable set CLOUDFLARE_ZONE_ID --repo bhashkarsharma/kody --body "<value>"
gh variable set APP_BASE_URL --repo bhashkarsharma/kody --body "https://<your-domain>"
gh variable set AGENTMAIL_FROM --repo bhashkarsharma/kody --body "<inbox>@agentmail.to"
```

## After filling in

1. Open https://github.com/bhashkarsharma/kody/actions — click **"I understand my workflows, go ahead and enable them"**
2. Trigger a deploy: `gh workflow run deploy.yml --repo bhashkarsharma/kody`
3. Watch it: `gh run watch --repo bhashkarsharma/kody`
