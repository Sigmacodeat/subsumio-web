/**
 * Word-level diff utility using LCS (Longest Common Subsequence).
 * Produces inline highlighting tokens for side-by-side rendering.
 */

export type DiffToken = {
  text: string;
  type: "equal" | "added" | "removed";
};

export type DiffResult = {
  left: DiffToken[];
  right: DiffToken[];
};

function tokenize(text: string): string[] {
  return text.split(/(\s+)/);
}

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

export function diffWords(original: string, revised: string): DiffResult {
  const aTokens = tokenize(original);
  const bTokens = tokenize(revised);
  const dp = lcsTable(aTokens, bTokens);

  const left: DiffToken[] = [];
  const right: DiffToken[] = [];

  let i = aTokens.length;
  let j = bTokens.length;

  type RawToken = { text: string; type: "equal" | "added" | "removed" };
  const rawLeft: RawToken[] = [];
  const rawRight: RawToken[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aTokens[i - 1] === bTokens[j - 1]) {
      rawLeft.push({ text: aTokens[i - 1], type: "equal" });
      rawRight.push({ text: bTokens[j - 1], type: "equal" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawRight.push({ text: bTokens[j - 1], type: "added" });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawLeft.push({ text: aTokens[i - 1], type: "removed" });
      i--;
    }
  }

  rawLeft.reverse();
  rawRight.reverse();

  for (const t of rawLeft) left.push(t);
  for (const t of rawRight) right.push(t);

  return { left, right };
}

export function buildAcceptedText(
  clauses: { original: string; revised: string; accepted?: boolean }[]
): string {
  return clauses.map((c) => (c.accepted ? c.revised : c.original)).join("\n\n");
}

export function diffStats(
  original: string,
  revised: string
): {
  additions: number;
  removals: number;
  unchanged: number;
} {
  const { left, right } = diffWords(original, revised);
  const removals = left.filter((t) => t.type === "removed" && t.text.trim()).length;
  const additions = right.filter((t) => t.type === "added" && t.text.trim()).length;
  const unchanged = right.filter((t) => t.type === "equal" && t.text.trim()).length;
  return { additions, removals, unchanged };
}
