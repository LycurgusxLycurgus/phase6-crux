# Arqueidentidad Fase VI Crux

Telegram-first BridgeCrux MVP for Arqueidentidad Fase VI. There is no frontend: Telegram is the UI, Convex is backend/memory/cron/webhook, Gemini is the tutor/orchestrator, and the reusable harness lives in `bridgecrux/`.

## Architecture

```text
Telegram Bot API
  -> Convex HTTP Action /telegram/webhook
  -> BridgeCrux agent loop
  -> Gemini function calling
  -> narrow Convex tools
  -> Telegram text diagrams and replies
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
