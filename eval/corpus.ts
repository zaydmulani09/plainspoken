// Eval corpus types and JSON helpers. Files are written with every non-ASCII
// character escaped, so sources can hold real em dashes (the pipeline must
// remove them) while the repo text itself contains none.
import { readFileSync, writeFileSync } from "node:fs";
import type { Tone } from "../engine/prompts";

export interface Source {
  id: string;
  genre: string;
  tone: Tone;
  generator: string;
  prompt: string;
  text: string;
}

export const CORPUS_PATH = new URL("./corpus.json", import.meta.url);

export function writeJson(path: URL | string, data: unknown) {
  const json = JSON.stringify(data, null, 2).replace(/[^\x00-\x7f]/gu, (c) =>
    [...c].map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp <= 0xffff) return "\\u" + cp.toString(16).padStart(4, "0");
      const v = cp - 0x10000;
      return "\\u" + (0xd800 + (v >> 10)).toString(16) + "\\u" + (0xdc00 + (v & 0x3ff)).toString(16);
    }).join(""),
  );
  writeFileSync(path, json + "\n");
}

export function readJson<T>(path: URL | string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadCorpus(): Source[] {
  return readJson<{ sources: Source[] }>(CORPUS_PATH).sources;
}
