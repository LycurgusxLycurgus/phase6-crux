# Arqueidentidad Fase VI Crux

Telegram-first BridgeCrux application for Arqueidentidad Fase VI with a mobile web companion. Telegram and React are two authenticated interfaces over the same Convex state; Gemini remains the tutor/orchestrator and the reusable harness lives in `bridgecrux/`.

## Architecture

```text
Telegram Bot API
  -> Convex HTTP Action /telegram/webhook
  -> BridgeCrux agent loop
  -> Gemini function calling
  -> narrow Convex tools
  -> Telegram text diagrams and replies

Telegram one-time link
  -> React /acceso exchange
  -> Convex Auth session for the existing Telegram user
  -> protected web queries and mutations
  -> the same routines, profile, practices, and history
```

The active domain is Fase VI only. Fases I-V are shown as coming soon and used only as compact context.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use `npm run dev`, not `npx convex dev`, from this workspace. The path contains `&` in `chatbot&page`, and on Windows the `npx`/`.bin` launcher can split the path and look for Convex in the wrong parent directory. The package scripts call Convex through `node ./node_modules/convex/bin/main.js`, which avoids that launcher bug.

`npm run codegen` requires a configured Convex deployment. Run `npm run dev` first and complete the Convex login/project setup when prompted; after that, `npm run codegen` can regenerate `convex/_generated/*`.

Set Convex environment variables with the same names as `.env.example`. Register the Telegram webhook with:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_DEPLOYMENT.convex.site/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

The browser reads `VITE_CONVEX_URL`. In local development `vite.config.ts` also accepts the existing `CONVEX_URL`. Set `VITE_TELEGRAM_BOT_USERNAME` without `@` so return actions open the correct guide. `SITE_URL` belongs in the Convex deployment and must be the public frontend origin (`http://localhost:5173` locally and the HTTPS Vercel domain in production).

## Web commands

- `npm run dev` starts Convex and Vite together.
- `npm run dev:web` starts only the mobile frontend.
- `npm run dev:convex` starts only the backend.
- `npm run build:web` typechecks both boundaries and creates the Vite production bundle.
- `npm run test:web-auth` validates issuance, exchange, single use, supersession, expiration, revocation, and cross-user isolation against the configured development deployment.

The web app is opened through a personalized Telegram link; it has no password or independent registration flow. In Telegram, `/web` issues a ten-minute, one-use link and `/webclose` closes pending links and active browser sessions.

## Vercel

`vercel.json` uses Vercel because this repository can build the Vite frontend and deploy Convex in one command, while preserving branch previews. Configure `CONVEX_DEPLOY_KEY` for the target deployment and set the production `SITE_URL` in Convex. Preview deployments should use their own Convex preview deployment and URL; never point an untrusted preview at production data.

## Commands

- `/start` starts onboarding: cadence, risk mode, hero, villains, first cycle.
- `/learn` shows Arqueidentidad phases with Fase VI active.
- `/practice` starts or resumes the current Fase VI practice.
- `/status` renders a Telegram-safe progress diagram.
- `/memory` shows compact one-line memories.
- `/debrief` creates a cycle-emotional debrief from the supplied text.
- `/settings` shows cadence, risk mode, and timezone.
- `/report` creates a BridgeCrux/EYE report.

## Production Notes

- Gemini settings are environment-driven. The default model is `gemini-3.1-flash-lite`, which supports function calling, structured outputs, URL context, long context, and thinking.
- The safety gate is deterministic code. The model can propose, but code blocks RED practices and constrains AMBER practices.
- Telegram messages are sent as plain text and chunked below Telegram's 4096-character limit.
- Convex cron rewrites compact memory lines daily instead of appending forever.
