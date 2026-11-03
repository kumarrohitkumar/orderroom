// Stretch (LLD §14): voice-note orders. Sarvam Saaras v4 speech-to-text handles Hinglish and
// Telegram's OGG/Opus natively. Read-only from OrderRoom's point of view: nothing is stored.
import { readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute } from "node:path";
import { DomainError } from "../domain/errors.js";

export const SARVAM_URL = "https://api.sarvam.ai/speech-to-text";
const AUDIO = new Map([
  [".ogg", "audio/ogg"],
  [".oga", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"],
  [".webm", "audio/webm"],
]);
const MAX_BYTES = 20 * 1024 * 1024;

export interface Transcript {
  text: string;
  language: string | null;
  file: string;
  reply_text: string;
}

type Fetch = typeof fetch;

export async function transcribe(
  filePath: string,
  opts: { apiKey?: string; fetchImpl?: Fetch } = {},
): Promise<Transcript> {
  const apiKey = opts.apiKey ?? process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new DomainError(
      "VOICE_UNAVAILABLE",
      "Speech-to-text is not configured (SARVAM_API_KEY missing)",
      "Voice note abhi samajh nahi sakta. Order type karke bhejo, jaise: @desk Sharma store 10 peti noodles.",
    );
  }
  if (!isAbsolute(filePath))
    throw new DomainError(
      "VALIDATION",
      "file_path must be absolute",
      "Pass the path download_attachment returned.",
    );
  const type = AUDIO.get(extname(filePath).toLowerCase());
  if (!type)
    throw new DomainError(
      "VALIDATION",
      `${basename(filePath)} is not an audio file`,
      "Only voice notes can be transcribed.",
    );
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    throw new DomainError(
      "NOT_FOUND",
      `${filePath} not found`,
      "Download the voice note first with download_attachment.",
    );
  }
  if (size > MAX_BYTES)
    throw new DomainError(
      "VALIDATION",
      "audio file is larger than 20 MB",
      "Voice note bahut lamba hai; chhota bhejo ya type karo.",
    );

  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)], { type }), basename(filePath));
  form.append("model", "saaras:v4");
  form.append("language_code", "hi-IN");

  const res = await (opts.fetchImpl ?? fetch)(SARVAM_URL, {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new DomainError(
      "VOICE_UNAVAILABLE",
      `Sarvam returned HTTP ${res.status}`,
      "Voice note abhi samajh nahi aaya. Order type karke bhejo.",
    );
  }
  const body = (await res.json()) as { transcript?: string; language_code?: string };
  const text = String(body.transcript ?? "").trim();
  if (!text) {
    throw new DomainError(
      "VOICE_UNAVAILABLE",
      "empty transcript",
      "Voice note mein kuch sunai nahi diya. Dobara bolo ya type karo.",
    );
  }
  return {
    text,
    language: body.language_code ?? null,
    file: basename(filePath),
    reply_text: `🎙️ Samjha: "${text}" — sahi hai? reply \`@desk haan\``,
  };
}
