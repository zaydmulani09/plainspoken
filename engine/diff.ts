// Word-level diff (LCS over tokens that keep their trailing whitespace).

export interface DiffPart {
  type: "same" | "add" | "del";
  text: string;
}

function tokens(s: string): string[] {
  return s.match(/\s+|[\p{L}\p{N}'’]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

export function wordDiff(a: string, b: string): DiffPart[] {
  const x = tokens(a);
  const y = tokens(b);
  const n = x.length;
  const m = y.length;
  // Trim common prefix and suffix so the DP table stays small.
  let pre = 0;
  while (pre < n && pre < m && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && x[n - 1 - suf] === y[m - 1 - suf]) suf++;
  const xs = x.slice(pre, n - suf);
  const ys = y.slice(pre, m - suf);
  const dp: Uint32Array[] = Array.from({ length: xs.length + 1 }, () => new Uint32Array(ys.length + 1));
  for (let i = xs.length - 1; i >= 0; i--) {
    for (let j = ys.length - 1; j >= 0; j--) {
      dp[i][j] = xs[i] === ys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  if (pre) push("same", x.slice(0, pre).join(""));
  let i = 0;
  let j = 0;
  while (i < xs.length && j < ys.length) {
    if (xs[i] === ys[j]) {
      push("same", xs[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", xs[i++]);
    else push("add", ys[j++]);
  }
  while (i < xs.length) push("del", xs[i++]);
  while (j < ys.length) push("add", ys[j++]);
  if (suf) push("same", x.slice(n - suf).join(""));
  return parts;
}

// Share of the original's words that survive unchanged.
export function keptShare(a: string, b: string): number {
  const parts = wordDiff(a, b);
  const count = (t: string) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const same = parts.filter((p) => p.type === "same").reduce((s, p) => s + count(p.text), 0);
  const total = count(a);
  return total ? same / total : 1;
}
