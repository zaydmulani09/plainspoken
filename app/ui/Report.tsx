import { CATEGORY_LABELS, type LintReport } from "@/engine/lint";
import type { HumanizeResult } from "@/engine/pipeline";

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const fmt2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <div className="py-4 pr-4">
      <div className="text-[13px] font-medium text-[var(--text-2)]">{label}</div>
      <div
        className="num mt-1 text-[28px] leading-[1.1] font-semibold tracking-[-0.02em]"
        style={tone ? { color: tone === "ok" ? "var(--ok)" : "var(--warn)" } : undefined}
      >
        {value}
      </div>
      <div className="mt-1 text-[13px] leading-snug text-[var(--text-3)]">{sub}</div>
    </div>
  );
}

function rows(before: LintReport, after: LintReport | null) {
  const cats = new Map<string, { label: string; before: number; after: number | null; examples: string[] }>();
  const bump = (r: LintReport, key: "before" | "after") => {
    for (const h of r.hits) {
      if (h.weight <= 0) continue;
      const row = cats.get(h.category) ?? { label: CATEGORY_LABELS[h.category] ?? h.category, before: 0, after: after ? 0 : null, examples: [] };
      row[key] = (row[key] ?? 0) + 1;
      const ex = h.text.trim().toLowerCase().replace(/[.,;:!?\s]+$/u, "");
      if (key === "before" && ex.length <= 40 && !row.examples.includes(ex) && row.examples.length < 4) row.examples.push(ex);
      cats.set(h.category, row);
    }
  };
  bump(before, "before");
  if (after) bump(after, "after");
  return [...cats.values()].sort((a, b) => b.before - a.before || (b.after ?? 0) - (a.after ?? 0));
}

export default function Report({ before, after, result }: { before: LintReport | null; after: LintReport | null; result: HumanizeResult | null }) {
  if (!before) {
    return (
      <p className="text-[15px] text-[var(--text-3)]">
        Paste some text to see its tells. The report runs in your browser and costs nothing.
      </p>
    );
  }
  const reduction = after && before.density > 0 ? Math.round((1 - after.density / before.density) * 100) : null;
  const cvOf = (r: LintReport) => r.metrics.find((m) => m.id === "rhythm-sentence-cv");
  const cvBefore = cvOf(before);
  const cvAfter = after ? cvOf(after) : undefined;
  const lengthPct = after && before.words ? Math.round(((after.words - before.words) / before.words) * 100) : null;
  const m = result?.meaning;
  const kept = m ? m.claims - m.missing.length : 0;
  const list = rows(before, after);
  const metrics = before.metrics.map((b) => ({ b, a: after?.metrics.find((x) => x.id === b.id) }));
  const cols = after ? "grid-cols-[1fr_64px_64px]" : "grid-cols-[1fr_64px]";

  return (
    <div>
      <div className="grid grid-cols-2 border-t border-[var(--line)] lg:grid-cols-4">
        <Stat
          label="AI tells per 100 words"
          value={after ? <>{fmt1(before.density)} <span className="text-[var(--text-3)]">→</span> {fmt1(after.density)}</> : fmt1(before.density)}
          sub={reduction !== null ? (reduction >= 0 ? `${reduction}% fewer` : `${-reduction}% more`) : `${before.hits.filter((h) => h.weight > 0).length} matches found`}
        />
        <Stat
          label="Meaning"
          value={m ? (m.ok ? "Kept" : "Review") : <span className="text-[var(--text-3)]">Not run</span>}
          tone={m ? (m.ok ? "ok" : "warn") : undefined}
          sub={
            m
              ? `${kept} of ${m.claims} claims kept${m.added.length ? `, ${m.added.length} added` : ", none added"}`
              : "Checked claim by claim after a rewrite"
          }
        />
        <Stat
          label="Length in words"
          value={after ? <>{before.words} <span className="text-[var(--text-3)]">→</span> {after.words}</> : before.words}
          sub={lengthPct === null ? `${before.sentenceCount} sentences` : lengthPct === 0 ? "Same length" : `${Math.abs(lengthPct)}% ${lengthPct < 0 ? "shorter" : "longer"}`}
        />
        <Stat
          label="Sentence length spread"
          value={
            cvBefore ? (
              cvAfter ? <>{fmt2(cvBefore.value)} <span className="text-[var(--text-3)]">→</span> {fmt2(cvAfter.value)}</> : fmt2(cvBefore.value)
            ) : (
              <span className="text-[var(--text-3)]">Too short</span>
            )
          }
          sub="Below 0.42 tends to read flat"
        />
      </div>

      <div className="pane mt-4 overflow-hidden">
        <div className={`grid ${cols} gap-3 px-4 pt-3 pb-2 text-[12px] font-medium text-[var(--text-3)]`}>
          <span>Tell</span>
          <span className="text-right">Before</span>
          {after && <span className="text-right">After</span>}
        </div>
        {list.length === 0 && metrics.every((x) => !x.b.triggered && !x.a?.triggered) ? (
          <div className="border-t border-[var(--line)] px-4 py-3 text-[15px] text-[var(--text-2)]">No tells found.</div>
        ) : null}
        {list.map((r) => (
          <div key={r.label} className={`grid ${cols} items-baseline gap-3 border-t border-[var(--line)] px-4 py-2.5`}>
            <div className="min-w-0">
              <div className="text-[15px]">{r.label}</div>
              {r.examples.length > 0 && <div className="truncate text-[13px] text-[var(--text-3)]">{r.examples.join(", ")}</div>}
            </div>
            <span className="num text-right text-[15px]">{r.before}</span>
            {after && (
              <span className="num text-right text-[15px]" style={r.after === 0 ? { color: "var(--ok)" } : undefined}>
                {r.after}
              </span>
            )}
          </div>
        ))}
        {metrics.map(({ b, a }) => (
          <div key={b.id} className={`grid ${cols} items-baseline gap-3 border-t border-[var(--line)] px-4 py-2.5`}>
            <div className="text-[15px]">{b.label}</div>
            <span className="num text-right text-[15px]" style={b.triggered ? { color: "var(--warn)" } : undefined}>
              {fmt2(b.value)}
            </span>
            {after && (
              <span className="num text-right text-[15px]" style={a?.triggered ? { color: "var(--warn)" } : undefined}>
                {a ? fmt2(a.value) : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
