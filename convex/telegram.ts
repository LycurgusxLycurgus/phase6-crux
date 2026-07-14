"use node";

import { chunkTelegramText } from "../bridgecrux/core";

export class TelegramBoundaryError extends Error {
  boundary: string;
  original: unknown;

  constructor(boundary: string, original: unknown) {
    const message = original instanceof Error ? original.message : String(original);
    super(`${boundary}: ${message}`);
    this.name = "TelegramBoundaryError";
    this.boundary = boundary;
    this.original = original;
  }
}

export async function sendTelegramText(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN missing; outgoing Telegram message suppressed.");
    console.log(text);
    return;
  }

  for (const chunk of chunkTelegramText(text)) {
    const formatted = formatTelegramHtml(chunk);
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatted,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
    } catch (error) {
      throw new TelegramBoundaryError("telegram:sendMessage", error);
    }

    if (!response.ok) {
      let fallback: Response;
      try {
        fallback = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            disable_web_page_preview: true,
          }),
        });
      } catch (error) {
        throw new TelegramBoundaryError("telegram:sendMessage_plain_fallback", error);
      }
      if (!fallback.ok) {
        const body = await fallback.text();
        throw new Error(`Telegram sendMessage failed: ${fallback.status} ${body}`);
      }
    }
  }
}

export function formatTelegramHtml(text: string): string {
  return escapeTelegramHtml(text)
    .replace(/^\s*#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<b>$2</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
