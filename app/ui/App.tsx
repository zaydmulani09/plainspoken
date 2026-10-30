"use client";
import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { wordDiff } from "@/engine/diff";
import { lint, type Hit } from "@/engine/lint";
import type { HumanizeResult, ParagraphPlan, ParagraphResult, PipelineEvent, Stage } from "@/engine/pipeline";
import type { Mode, Tone } from "@/engine/prompts";
import { countWords, splitBlocks } from "@/engine/text";
import { buildVoiceCard, isVoiceCard, MIN_VOICE_WORDS, type VoiceCard } from "@/engine/voice";
import { Check, Copy, KeyIcon, Person, Stop, Warn } from "./icons";
import Report from "./Report";
import { SAMPLE } from "./sample";
import Segmented from "./Segmented";
import Sheet from "./Sheet";

const REPO = "https://github.com/zaydmulani09/plainspoken";

const MODE_OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Edits only the sentences the linter flags." },
  { value: "standard", label: "Standard", hint: "Rewrites each paragraph and keeps its structure." },
  { value: "deep", label: "Deep", hint: "Lists each paragraph's claims, then writes it fresh from them." },
];
const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "neutral", label: "Neutral" },
  { value: "academic", label: "Academic" },
  { value: "professional", label: "Professional" },
];
const STAGE_LABEL: Record<Stage, string> = {
  queued: "Waiting",
  extracting: "Reading claims",
  writing: "Writing two drafts",
  checking: "Checking meaning",
  repairing: "Fixing a draft",
  done: "Done",
  skipped: "Kept as is",
};

const FALLBACK_NOTE: Record<NonNullable<ParagraphResult["fallback"]>, (r: ParagraphResult) => string> = {
  original: () => "Kept as written. Every draft changed the meaning, even after two repair rounds.",
  length: (r) =>
    `The meaning checks out, but the length moved from ${countWords(r.original)} to ${countWords(r.text)} words. Read it against your original.`,
  time: () => "Kept as written. The run reached its time limit before this paragraph. Rewrite it on its own to finish it.",
  error: () => "Kept as written. The model provider failed on this paragraph. Try again in a minute.",
};

type View = "changes" | "tells" | "clean";
type ServerInfo = { name: string; writer: string; judge: string } | null;
type StreamEvent = PipelineEvent | { type: "start" } | { type: "ping" } | { type: "done"; result: HumanizeResult } | { type: "error"; message: string };

interface Run {
  status: "idle" | "running" | "done" | "error";
  blocks: { kind: string; text: string }[];
  plan: ParagraphPlan[];
  stages: Record<number, Stage>;
  results: Record<number, ParagraphResult>;
  result: HumanizeResult | null;
  error: string | null;
}

const IDLE: Run = { status: "idle", blocks: [], plan: [], stages: {}, results: {}, result: null, error: null };

type Action = { type: "begin"; source: string } | { type: "event"; ev: StreamEvent } | { type: "fail"; message: string };

function reducer(s: Run, a: Action): Run {
  if (a.type === "begin") return { ...IDLE, status: "running", blocks: splitBlocks(a.source) };
  if (a.type === "fail") return { ...s, status: "error", error: a.message };
  const ev = a.ev;
  switch (ev.type) {
    case "plan":
      return { ...s, plan: ev.paragraphs };
    case "stage":
      return { ...s, stages: { ...s.stages, [ev.i]: ev.stage } };
    case "paragraph":
      return { ...s, results: { ...s.results, [ev.result.i]: ev.result } };
    case "done":
      return { ...s, status: "done", result: ev.result };
    case "error":
      return { ...s, status: "error", error: ev.message };
    default:
      return s;
  }
}

function load<T>(key: string, ok: (x: unknown) => x is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return ok(v) ? v : null;
  } catch {
    return null;
  }
}
function save(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

// Splits text into plain runs and <mark> runs for non-overlapping hits.
function marked(text: string, hits: Hit[], className: string) {
  const out: React.ReactNode[] = [];
  let at = 0;
  const sorted = hits.filter((h) => h.weight > 0).sort((a, b) => a.start - b.start || b.end - a.end);
  for (const h of sorted) {
    if (h.start < at) continue;
    out.push(text.slice(at, h.start));
    out.push(
      <mark key={h.start} className={className} title={h.label}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    at = h.end;
  }
  out.push(text.slice(at));
  return out;
}

function Paragraph({ i, run, view }: { i: number; run: Run; view: View }) {
  const block = run.blocks[i];
  const r = run.results[i];
  const stage = run.stages[i];
  const diff = useMemo(() => (r && r.text !== r.original ? wordDiff(r.original, r.text) : null), [r]);
  const kind = block.kind === "code" ? "font-mono text-[14px]" : block.kind === "heading" ? "font-semibold" : "";

  if (!r) {
    const label = stage ? STAGE_LABEL[stage] : run.status === "running" ? "Waiting" : "Not finished";
    return (
      <div className="mb-[1em]" aria-busy={run.status === "running"}>
        <div className="mb-1 flex items-center gap-2 font-sans text-[12px] font-medium text-[var(--text-2)]">
          {run.status === "running" && <span className="spinner" aria-hidden />}
          {label}
        </div>
        <div className={`text-[var(--text-3)] ${kind}`}>{block.text}</div>
      </div>
    );
  }
  const note = r.fallback ? FALLBACK_NOTE[r.fallback](r) : null;
  return (
    <div className="enter mb-[1em]">
      <div className={kind}>
        {view === "changes" && diff
          ? diff.map((p, k) => (p.type === "del" ? null : p.type === "add" ? <span key={k} className="chg">{p.text}</span> : p.text))
          : r.text}
      </div>
      {note && (
        <div className="mt-2 flex gap-2 rounded-[8px] bg-[var(--warn-tint)] px-3 py-2 font-sans text-[13px] leading-snug text-[var(--text)]">
          <Warn className="mt-[2px] shrink-0 text-[var(--warn)]" />
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("standard");
  const [tone, setTone] = useState<Tone>("neutral");
  const [voice, setVoice] = useState<VoiceCard | null>(null);
  const [key, setKey] = useState("");
  const [server, setServer] = useState<ServerInfo | undefined>(undefined);
  const [maxWords, setMaxWords] = useState(1500);
  const [showTells, setShowTells] = useState(true);
  const [view, setView] = useState<View>("changes");
  const [sheet, setSheet] = useState<"voice" | "key" | null>(null);
  const [copied, setCopied] = useState(false);
  const [run, dispatch] = useReducer(reducer, IDLE);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const m = load("plainspoken.mode", (x): x is Mode => MODE_OPTIONS.some((o) => o.value === x));
    const t = load("plainspoken.tone", (x): x is Tone => TONE_OPTIONS.some((o) => o.value === x));
    if (m) setMode(m);
    if (t) setTone(t);
    setVoice(load("plainspoken.voice", isVoiceCard));
    fetch("/api/status")
      .then((r) => r.json())
      .then((j) => {
        setServer(j.server ?? null);
        if (typeof j.maxWords === "number") setMaxWords(j.maxWords);
      })
      .catch(() => setServer(null));
  }, []);

  const words = useMemo(() => countWords(text), [text]);
  const deferred = useDeferredValue(text);
  const report = useMemo(() => (deferred.trim() ? lint(deferred) : null), [deferred]);
  const running = run.status === "running";
  const overLimit = !key && words > maxWords;
  const needsKey = server === null && !key;
  const canRun = words > 0 && !overLimit && !needsKey && !running;

  const total = run.plan.filter((p) => p.rewrite).length;
  const finished = Object.values(run.results).filter((r) => run.plan[r.i]?.rewrite).length;
  const progress = run.status === "running" ? Math.max(0.04, total ? finished / total : 0) : run.status === "done" ? 1 : 0;

  const result = run.result;
  const outWords = result ? countWords(result.text) : null;

  async function start() {
    if (!canRun) return;
    const source = text.replace(/\r\n?/g, "\n").trim();
    dispatch({ type: "begin", source });
    setView("changes");
    const c = new AbortController();
    ctrl.current = c;
    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "x-provider-key": key } : {}) },
        body: JSON.stringify({ text: source, mode, tone, voice }),
        signal: c.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        dispatch({ type: "fail", message: j?.error ?? `The server answered with status ${res.status}.` });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "done" || ev.type === "error") ended = true;
          dispatch({ type: "event", ev });
        }
      }
      if (!ended) dispatch({ type: "fail", message: "The connection closed before the rewrite finished. Try again." });
    } catch {
      dispatch({
        type: "fail",
        message: c.signal.aborted ? "Stopped. Finished paragraphs are shown." : "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      ctrl.current = null;
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  const runLabel = running ? "Stop" : run.status === "done" ? "Rewrite again" : "Rewrite";
  const blockedReason = needsKey
    ? "This deployment has no server key. Add your own key to rewrite."
    : overLimit
      ? `The free key takes up to ${maxWords.toLocaleString("en-US")} words. Shorten the text or add your own key.`
      : null;

  return (
    <>
      <header className="bar sticky top-0 z-30">
        <div className="mx-auto flex h-[52px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#" className="text-[17px] font-semibold tracking-[-0.022em]">
            Plainspoken
          </a>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="btn btn-plain hidden text-[13px] text-[var(--text-2)] sm:inline-flex">
              How it works
            </a>
            <a href={REPO} className="btn btn-plain hidden text-[13px] text-[var(--text-2)] sm:inline-flex">
              GitHub
            </a>
            <button
              type="button"
              className={running ? "btn" : "btn btn-primary !h-8 !rounded-[8px] !px-4 !text-[14px]"}
              disabled={!running && !canRun}
              onClick={() => (running ? ctrl.current?.abort() : start())}
            >
              {running && <Stop />}
              {runLabel}
            </button>
          </nav>
        </div>
        <div
          className="absolute inset-x-0 bottom-[-1px] h-[2px] origin-left bg-[var(--accent)]"
          style={{
            transform: `scaleX(${progress})`,
            opacity: running ? 1 : 0,
            transition: "transform 400ms var(--ease-out), opacity 300ms ease 200ms",
          }}
          aria-hidden
        />
      </header>

      <main className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <section className="pt-10 pb-7 sm:pt-14 sm:pb-9">
          <h1 className="max-w-[20ch] text-[32px] leading-[1.1] font-semibold tracking-[-0.028em] sm:text-[44px] sm:tracking-[-0.032em]">
            Make AI text read like a person wrote it.
          </h1>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-[1.47] text-[var(--text-2)]">
            Plainspoken rewrites one paragraph at a time. Names, numbers and quotes stay exactly as written, a second
            model checks that every claim survives, and you see each change before you copy it. Free and open source,
            no account.
          </p>
        </section>

        <section aria-label="Settings" className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="w-full sm:w-auto">
            <div className="label mb-1.5">Mode</div>
            <Segmented label="Mode" value={mode} options={MODE_OPTIONS} onChange={(v) => (setMode(v), save("plainspoken.mode", v))} className="w-full sm:w-auto" />
          </div>
          <div className="w-full sm:w-auto">
            <div className="label mb-1.5">Tone</div>
            <Segmented label="Tone" value={tone} options={TONE_OPTIONS} onChange={(v) => (setTone(v), save("plainspoken.tone", v))} className="w-full sm:w-auto" />
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button type="button" className="btn" onClick={() => setSheet("voice")} aria-haspopup="dialog">
              {voice ? <Check className="text-[var(--accent)]" /> : <Person />}
              {voice ? "Your voice" : "Add your voice"}
            </button>
            <button type="button" className="btn" onClick={() => setSheet("key")} aria-haspopup="dialog">
              {key ? <Check className="text-[var(--accent)]" /> : <KeyIcon />}
              {key ? "Your key" : "Use your key"}
            </button>
          </div>
          <p className="w-full text-[13px] text-[var(--text-3)]">{MODE_OPTIONS.find((o) => o.value === mode)!.hint}</p>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="pane flex flex-col" aria-label="Original">
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
              <h2 className="text-[13px] font-semibold">Original</h2>
              {words === 0 ? (
                <button type="button" className="btn btn-plain !h-7 text-[13px]" onClick={() => setText(SAMPLE)}>
                  Try an example
                </button>
              ) : (
                <span className="num text-[13px] text-[var(--text-3)]">
                  <span style={overLimit ? { color: "var(--warn)" } : undefined}>{words.toLocaleString("en-US")} words</span>
                  {report ? ` · ${report.density.toFixed(1)} tells per 100` : ""}
                </span>
              )}
            </div>
            <div className="editor prose-edit grid flex-1 px-5 pt-2 pb-4">
              <div className="editor-layer" aria-hidden>
                {showTells && report ? marked(text, report.hits, "tell-mark") : text}{" "}
              </div>
              <textarea
                className="editor-layer"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    start();
                  }
                }}
                placeholder="Paste text here."
                spellCheck
                aria-label="Text to rewrite"
              />
            </div>
            <div className="flex min-h-[44px] items-center justify-between gap-3 border-t border-[var(--line)] px-3 py-1.5 sm:px-4">
              <button type="button" className="btn btn-plain !h-7 text-[13px]" onClick={() => setShowTells((v) => !v)} disabled={!words}>
                {showTells ? "Hide tells" : "Show tells"}
              </button>
              {blockedReason ? (
                <span className="text-right text-[12px] leading-snug text-[var(--warn)]">{blockedReason}</span>
              ) : words > 0 ? (
                <button type="button" className="btn btn-plain !h-7 text-[13px] text-[var(--text-2)]" onClick={() => setText("")} disabled={running}>
                  Clear
                </button>
              ) : null}
            </div>
          </section>

          <section className="pane flex flex-col" aria-label="Rewrite" aria-live="polite">
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
              <h2 className="text-[13px] font-semibold">Rewrite</h2>
              <div className="flex items-center gap-2">
                {result && (
                  <span
                    className="inline-flex h-[22px] items-center gap-1 rounded-[6px] px-2 text-[12px] font-semibold"
                    style={
                      result.meaning.ok
                        ? { color: "var(--ok)", background: "color-mix(in srgb, var(--ok) 12%, transparent)" }
                        : { color: "var(--warn)", background: "var(--warn-tint)" }
                    }
                  >
                    {result.meaning.ok ? <Check size={12} /> : <Warn size={12} />}
                    {result.meaning.ok ? "Meaning kept" : "Check meaning"}
                  </span>
                )}
                {running && total > 0 && (
                  <span className="num text-[13px] text-[var(--text-3)]">
                    {finished} of {total} paragraphs
                  </span>
                )}
                {outWords !== null && result && <span className="num text-[13px] text-[var(--text-3)]">{outWords.toLocaleString("en-US")} words</span>}
              </div>
            </div>
            <div className="prose-edit flex-1 px-5 pt-2 pb-4">
              {run.status === "idle" ? (
                <p className="font-sans text-[15px] text-[var(--text-3)]">Your rewrite shows up here, one paragraph at a time.</p>
              ) : view === "tells" && result ? (
                <div className="enter">{marked(result.text, result.after.hits, "tell-hl")}</div>
              ) : (
                run.blocks.map((_, i) => <Paragraph key={i} i={i} run={run} view={view} />)
              )}
              {run.status === "error" && (
                <div className="mt-2 flex gap-2 rounded-[8px] bg-[var(--warn-tint)] px-3 py-2 font-sans text-[13px] leading-snug">
                  <Warn className="mt-[2px] shrink-0 text-[var(--warn)]" />
                  <span>{run.error}</span>
                </div>
              )}
            </div>
            <div className="flex min-h-[44px] items-center justify-between gap-3 border-t border-[var(--line)] px-3 py-1.5 sm:px-4">
              {result ? (
                <Segmented
                  label="Show"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "changes", label: "Changes" },
                    { value: "tells", label: "Tells" },
                    { value: "clean", label: "Clean" },
                  ]}
                />
              ) : (
                <span className="px-1 text-[12px] text-[var(--text-3)]">
                  {result === null && run.status === "running" ? "Rewriting. Paragraphs appear as they finish." : ""}
                </span>
              )}
              <button type="button" className="btn" onClick={copy} disabled={!result}>
                {copied ? <Check className="text-[var(--ok)]" /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {result && (
              <p className="px-5 pb-3 text-[12px] text-[var(--text-3)]">
                Written by {result.provider.writer}, checked by {result.provider.judge}
                {result.provider.source === "byok" ? " on your key" : " on the free key"}.
              </p>
            )}
          </section>
        </div>

        <section className="mt-12" aria-labelledby="report-h">
          <h2 id="report-h" className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">
            Report
          </h2>
          <Report before={result ? result.before : report} after={result ? result.after : null} result={result} />
        </section>

        <section id="how" className="mt-16 scroll-mt-20" aria-labelledby="how-h">
          <h2 id="how-h" className="text-[22px] font-semibold tracking-[-0.02em]">
            How it works
          </h2>
          <dl className="mt-4">
            {HOW.map(([term, body]) => (
              <div key={term} className="grid gap-1 border-t border-[var(--line)] py-4 lg:grid-cols-[220px_1fr] lg:gap-10">
                <dt className="text-[15px] font-semibold">{term}</dt>
                <dd className="max-w-[68ch] text-[15px] leading-[1.55] text-[var(--text-2)]">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-12 flex flex-wrap justify-between gap-2 border-t border-[var(--line)] py-6 text-[12px] text-[var(--text-3)]">
          <span>MIT licensed. Detector scores: not measured.</span>
          <a href={REPO} className="hover:text-[var(--text-2)]">
            Source on GitHub
          </a>
        </footer>
      </main>

      <VoiceSheet open={sheet === "voice"} onClose={() => setSheet(null)} voice={voice} setVoice={(v) => (setVoice(v), save("plainspoken.voice", v))} />
      <KeySheet open={sheet === "key"} onClose={() => setSheet(null)} value={key} setValue={setKey} server={server} maxWords={maxWords} />
    </>
  );
}

const HOW: [string, React.ReactNode][] = [
  [
    "Locked details",
    <>
      Before anything is rewritten, Plainspoken finds the parts that must not change: numbers, dates, names, links,
      citations, code, quoted text, and [bracketed placeholders]. A draft that alters or drops one, or adds a new one, is
      rejected. Plainspoken never fills in a placeholder for you.
    </>,
  ],
  [
    "Two drafts, then checks",
    <>
      The writer model drafts each paragraph twice. A separate judge model lists the paragraph&apos;s claims and checks
      every draft against them, then scores the drafts and your original without knowing which is which. A draft wins
      only if it keeps every claim, adds none, and drops most of the tells. If none passes, the writer gets two repair
      rounds. If the meaning still does not hold, your paragraph is kept as written and marked, so a changed meaning
      never ships.
    </>,
  ],
  [
    "The tell score",
    <>
      The report is deterministic and runs in your browser. It counts patterns that guides on AI writing describe, such
      as stock vocabulary, contrast framing, and lists of three, plus rhythm checks like how much sentence length
      varies. The score is weighted matches per 100 words. It measures style habits. It cannot tell who wrote a text,
      and no AI detector was measured. The patterns and their sources are in{" "}
      <a className="text-[var(--accent)] hover:underline" href={`${REPO}/blob/main/engine/tells.json`}>
        tells.json
      </a>
      .
    </>,
  ],
  [
    "Privacy",
    <>
      Your text goes to the model provider for the rewrite and nowhere else. There is no database, and pasted text is
      never stored or logged. Your voice profile stays in this browser. A key you paste lives in this tab&apos;s memory and
      is sent only with your requests.
    </>,
  ],
  [
    "Limits",
    <>
      The free key takes 1,500 words per request, a few requests per network every ten minutes, and has a daily cap
      across everyone. With your own Anthropic or Groq key there are no caps beyond your provider&apos;s. The model is
      told to keep length within about 10%, so very padded text can come back shorter.
    </>,
  ],
];

function VoiceSheet({ open, onClose, voice, setVoice }: { open: boolean; onClose: () => void; voice: VoiceCard | null; setVoice: (v: VoiceCard | null) => void }) {
  const [draft, setDraft] = useState("");
  const n = countWords(draft);
  const card = useMemo(() => (n >= MIN_VOICE_WORDS ? buildVoiceCard(draft) : null), [draft, n]);
  const shown = card ?? voice;
  return (
    <Sheet open={open} onClose={onClose} title="Your voice">
      <p className="text-[14px] leading-[1.5] text-[var(--text-2)]">
        Paste {MIN_VOICE_WORDS} words or more of your own writing. Plainspoken measures it in this browser and sends that
        profile, plus two or three short excerpts, with each request. It is saved on this device only.
      </p>
      <textarea
        className="field prose-edit mt-3 h-40 resize-none !text-[15px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="An essay, a few emails, a blog post you wrote yourself."
        aria-label="Your own writing"
      />
      <div className="num mt-1.5 text-[12px] text-[var(--text-3)]">
        {n < MIN_VOICE_WORDS ? `${n} of ${MIN_VOICE_WORDS} words` : `${n} words`}
      </div>
      {shown && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[10px] bg-[var(--surface-2)] p-3 text-[13px]">
          {[
            ["Average sentence", `${shown.sentence.mean.toFixed(1)} words`],
            ["Contractions", `${shown.contractions.per100.toFixed(1)} per 100 words`],
            ["Reading grade", shown.grade.toFixed(1)],
            ["Questions", `${shown.punctuation.question.toFixed(1)} per 100 words`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[var(--text-3)]">{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {voice && (
          <button type="button" className="btn" onClick={() => (setVoice(null), setDraft(""))}>
            Remove voice
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={!card} onClick={() => (setVoice(card), setDraft(""), onClose())}>
          Save voice
        </button>
      </div>
    </Sheet>
  );
}

function KeySheet({
  open,
  onClose,
  value,
  setValue,
  server,
  maxWords,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  setValue: (v: string) => void;
  server: ServerInfo | undefined;
  maxWords: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  const k = draft.trim();
  const kind = k.startsWith("sk-ant-") ? "anthropic" : k.startsWith("gsk_") ? "groq" : k ? "unknown" : null;
  return (
    <Sheet open={open} onClose={onClose} title="Your own key">
      <p className="text-[14px] leading-[1.5] text-[var(--text-2)]">
        Paste an Anthropic or Groq API key to skip the free key&apos;s limits. It stays in this tab&apos;s memory, goes out
        with each request over HTTPS, is used for that request only, and is never stored or logged.
      </p>
      <input
        className="field mt-3 font-[inherit]"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="sk-ant-... or gsk_..."
        aria-label="API key"
      />
      <p className="mt-1.5 min-h-[18px] text-[12px] text-[var(--text-3)]">
        {kind === "anthropic"
          ? "Anthropic: Claude Sonnet 5.5 writes, Claude Haiku 5.5 checks."
          : kind === "groq"
            ? "Groq: Qwen3.8 27B writes, GPT-OSS checks."
            : kind === "unknown"
              ? "Anthropic keys start with sk-ant- and Groq keys with gsk_."
              : server === null
                ? "This deployment has no server key, so a key is required."
                : `Without a key, requests use the free ${server?.name === "anthropic" ? "Anthropic" : "Groq"} key: up to ${maxWords.toLocaleString("en-US")} words each, with a daily cap.`}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        {value && (
          <button type="button" className="btn" onClick={() => (setValue(""), setDraft(""))}>
            Remove key
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={kind !== "anthropic" && kind !== "groq"}
          onClick={() => (setValue(k), onClose())}
        >
          Use key
        </button>
      </div>
    </Sheet>
  );
}
