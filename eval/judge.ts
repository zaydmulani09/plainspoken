// Eval-only judge prompts. They run on a model the pipeline does not use
// (openai/gpt-oss-120b on Groq), with a neutral rubric: the eval judge is not
// told about AI tells, so it cannot reward a rewrite just for removing them.
import { dataNotice, requestId, type Tone } from "../engine/prompts";
import { parseJson, type Provider } from "../engine/providers";

const CLAIMS_SYSTEM = `You list the claims in a passage. A claim is any distinct fact, opinion, qualifier, condition, instruction, request, offer, or piece of advice. Write each as one short plain sentence. Keep numbers, names, and hedges that change meaning. Skip greetings and sign-offs that carry no content. Do not merge two claims into one. Return JSON only.`;

const CHECK_SYSTEM = `You compare a rewrite against a list of claims taken from the original text. Be strict and literal.
For each claim: "kept" if the rewrite states it with the same meaning; "changed" if the rewrite states it with a different meaning, a different number or name, or noticeably stronger or weaker certainty; "missing" if the rewrite does not state it.
Then list every claim the rewrite makes that the original does not support: new facts, details, examples, reasons, opinions, or promises. Rewording, reordering, merging sentences, and dropping filler are not additions. Return JSON only.`;

const PAIR_SYSTEM = `You are an experienced editor. You read two versions of the same text, A and B. Judge which is better writing for its reader: clear, natural, specific, easy to read, correct, and suited to the stated tone. Do not prefer a version for being longer or shorter. If they are about equally good, say tie. Return JSON only.`;

const SCHEMA_CLAIMS = {
  type: "object",
  properties: { claims: { type: "array", items: { type: "string" } } },
  required: ["claims"],
  additionalProperties: false,
};
const SCHEMA_CHECK = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, status: { type: "string", enum: ["kept", "changed", "missing"] } },
        required: ["id", "status"],
        additionalProperties: false,
      },
    },
    added: { type: "array", items: { type: "string" } },
  },
  required: ["results", "added"],
  additionalProperties: false,
};
const SCHEMA_PAIR = {
  type: "object",
  properties: { reason: { type: "string" }, winner: { type: "string", enum: ["A", "B", "tie"] } },
  required: ["reason", "winner"],
  additionalProperties: false,
};

export async function extractClaims(p: Provider, text: string): Promise<string[]> {
  const rid = requestId();
  const user = `${dataNotice(rid, ["passage"])}

List the claims in this passage.

<passage-${rid}>
${text}
</passage-${rid}>

Return {"claims": [...]}.`;
  const r = await p.call({ role: "judge", system: CLAIMS_SYSTEM, user, schema: SCHEMA_CLAIMS, maxTokens: 2500 });
  return parseJson<{ claims: string[] }>(r.text).claims.filter((c) => typeof c === "string" && c.trim());
}

export interface ClaimCheck {
  kept: number;
  changed: string[];
  missing: string[];
  added: string[];
}

export async function checkClaims(p: Provider, original: string, claims: string[], rewrite: string): Promise<ClaimCheck> {
  const rid = requestId();
  const user = `${dataNotice(rid, ["original", "rewrite"])}

Claims from the original, numbered:
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}

<original-${rid}>
${original}
</original-${rid}>

<rewrite-${rid}>
${rewrite}
</rewrite-${rid}>

Return {"results": [{"id": <claim number>, "status": "kept" | "changed" | "missing"}, ...], "added": ["<claim the rewrite adds>", ...]}. Give a result for every claim.`;
  const r = await p.call({ role: "judge", system: CHECK_SYSTEM, user, schema: SCHEMA_CHECK, maxTokens: 3000 });
  const j = parseJson<{ results: { id: number; status: string }[]; added: string[] }>(r.text);
  const status = new Map(j.results.map((x) => [x.id, x.status]));
  const out: ClaimCheck = { kept: 0, changed: [], missing: [], added: (j.added ?? []).filter((a) => a.trim()) };
  claims.forEach((c, i) => {
    const s = status.get(i + 1) ?? "missing";
    if (s === "kept") out.kept++;
    else if (s === "changed") out.changed.push(c);
    else out.missing.push(c);
  });
  return out;
}

// Returns the rewrite's result against the original: "win", "tie" or "loss".
// The order of the two versions is random per call.
export async function pairwise(p: Provider, tone: Tone, original: string, rewrite: string): Promise<{ result: "win" | "tie" | "loss"; rewriteWas: "A" | "B"; reason: string }> {
  const rid = requestId();
  const rewriteFirst = (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & 1) === 1;
  const [a, b] = rewriteFirst ? [rewrite, original] : [original, rewrite];
  const user = `${dataNotice(rid, ["version-A", "version-B"])}

Tone the text is meant to have: ${tone}.

<version-A-${rid}>
${a}
</version-A-${rid}>

<version-B-${rid}>
${b}
</version-B-${rid}>

Return {"reason": "<one sentence>", "winner": "A" | "B" | "tie"}.`;
  const r = await p.call({ role: "judge", system: PAIR_SYSTEM, user, schema: SCHEMA_PAIR, maxTokens: 1500 });
  const j = parseJson<{ winner: string; reason: string }>(r.text);
  const rewriteWas = rewriteFirst ? "A" : "B";
  const result = j.winner === "tie" ? "tie" : j.winner === rewriteWas ? "win" : "loss";
  return { result, rewriteWas, reason: j.reason ?? "" };
}
