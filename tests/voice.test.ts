import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DomainError } from "../src/domain/errors.js";
import { SARVAM_URL, transcribe } from "../src/transcribe/sarvam.js";

const dir = mkdtempSync(join(tmpdir(), "orderroom-voice-"));
const ogg = join(dir, "note.ogg");
writeFileSync(ogg, Buffer.from("OggS fake opus bytes"));

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof DomainError ? e.code : String(e);
  }
};

describe("transcribe_voice (Sarvam Saaras v4)", () => {
  it("posts the file with model saaras:v4 and hi-IN, returns an echo to confirm", async () => {
    let seen:
      | { url: string; key: string | null; model: unknown; lang: unknown; file: unknown }
      | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      const f = init.body as FormData;
      seen = {
        url,
        key: new Headers(init.headers).get("api-subscription-key"),
        model: f.get("model"),
        lang: f.get("language_code"),
        file: (f.get("file") as File).name,
      };
      return new Response(
        JSON.stringify({
          transcript: "Gupta provision ko bees peti chai bhej do",
          language_code: "hi-IN",
        }),
      );
    }) as unknown as typeof fetch;
    const t = await transcribe(ogg, { apiKey: "k", fetchImpl: fake });
    expect(seen).toEqual({
      url: SARVAM_URL,
      key: "k",
      model: "saaras:v4",
      lang: "hi-IN",
      file: "note.ogg",
    });
    expect(t.text).toBe("Gupta provision ko bees peti chai bhej do");
    expect(t.reply_text).toContain("Samjha");
    expect(t.reply_text).toContain("@desk haan");
  });

  it("without a key it asks the person to type instead", async () => {
    const saved = process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_API_KEY;
    expect(await code(transcribe(ogg))).toBe("VOICE_UNAVAILABLE");
    if (saved) process.env.SARVAM_API_KEY = saved;
  });

  it("rejects relative paths, non-audio files and missing files", async () => {
    const txt = join(dir, "x.txt");
    writeFileSync(txt, "hi");
    expect(await code(transcribe("note.ogg", { apiKey: "k" }))).toBe("VALIDATION");
    expect(await code(transcribe(txt, { apiKey: "k" }))).toBe("VALIDATION");
    expect(await code(transcribe(join(dir, "gone.ogg"), { apiKey: "k" }))).toBe("NOT_FOUND");
  });

  it("an API failure or empty transcript is a polite refusal", async () => {
    const fail = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    const empty = (async () =>
      new Response(JSON.stringify({ transcript: "" }))) as unknown as typeof fetch;
    expect(await code(transcribe(ogg, { apiKey: "k", fetchImpl: fail }))).toBe("VOICE_UNAVAILABLE");
    expect(await code(transcribe(ogg, { apiKey: "k", fetchImpl: empty }))).toBe(
      "VOICE_UNAVAILABLE",
    );
  });
});
