import fs from "node:fs";
import path from "node:path";
import { config, requireKeys } from "./config.js";

export type TgMessage = {
  message_id: number;
  date: number;
  chat: { id: number; type: string; first_name?: string; username?: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
  photo?: { file_id: string; width: number; height: number; file_size?: number }[];
  video?: { file_id: string; duration: number; file_size?: number; mime_type?: string };
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
};
export type TgUpdate = { update_id: number; message?: TgMessage };

export const telegramEnabled = () => Boolean(config.telegram.botToken && config.telegram.chatId);

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call<T>(method: string, body: Record<string, unknown> | FormData): Promise<T> {
  requireKeys("TELEGRAM_BOT_TOKEN");
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "content-type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
  return data.result;
}

/** Sends HTML-formatted text (split if longer than Telegram's 4096-char limit). Returns the message ids. */
export async function sendMessage(html: string, replyTo?: number): Promise<number[]> {
  if (!telegramEnabled()) {
    console.log(`[telegram disabled] ${html.replace(/<[^>]+>/g, "")}`);
    return [];
  }
  const ids: number[] = [];
  for (let i = 0; i < html.length; i += 4000) {
    const msg = await call<TgMessage>("sendMessage", {
      chat_id: config.telegram.chatId,
      text: html.slice(i, i + 4000),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_parameters: replyTo && i === 0 ? { message_id: replyTo, allow_sending_without_reply: true } : undefined,
    });
    ids.push(msg.message_id);
  }
  return ids;
}

async function sendFile(method: "sendVideo" | "sendPhoto" | "sendDocument", field: string, file: string, captionHtml: string, extra: Record<string, string> = {}) {
  if (!telegramEnabled()) return null;
  const form = new FormData();
  form.append("chat_id", config.telegram.chatId);
  form.append("caption", captionHtml.slice(0, 1000));
  form.append("parse_mode", "HTML");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  form.append(field, new Blob([fs.readFileSync(file)]), path.basename(file));
  const msg = await call<TgMessage>(method, form);
  return msg.message_id;
}

export const sendVideo = (file: string, captionHtml: string) => sendFile("sendVideo", "video", file, captionHtml, { supports_streaming: "true" });
export const sendPhoto = (file: string, captionHtml: string) => sendFile("sendPhoto", "photo", file, captionHtml);

export const getUpdates = (offset: number) => call<TgUpdate[]>("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] });

/** Download a photo/video someone sent the bot (Telegram allows bots up to 20 MB). */
export async function downloadTelegramFile(fileId: string, dest: string) {
  const info = await call<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!info.file_path) throw new Error("Telegram didn't give a download link for that file.");
  const res = await fetch(`https://api.telegram.org/file/bot${config.telegram.botToken}/${info.file_path}`);
  if (!res.ok) throw new Error(`Couldn't download the file from Telegram (${res.status}).`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
