import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { arqueidentidadFase6Content } from "../cruxes/arqueidentidad-fase6/content";

const BUILD_ID = "phase6-crux-2026-05-27-phase6-prompt-corrections";

const http = httpRouter();

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");

    if (expectedSecret && actualSecret !== expectedSecret) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const update = await request.json();
    await ctx.scheduler.runAfter(0, internal.agent.handleTelegramUpdate, {
      updateJson: JSON.stringify(update),
    });

    return json({ ok: true });
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => json({
    ok: true,
    service: "arqueidentidad-fase6-crux",
    buildId: BUILD_ID,
    practiceIds: arqueidentidadFase6Content.practices.map((practice) => practice.id),
    practiceCount: arqueidentidadFase6Content.practices.length,
  })),
});

export default http;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
