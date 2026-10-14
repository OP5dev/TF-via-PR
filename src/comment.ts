/**
 * PR-comment and job-summary rendering (Phase 5 of the TypeScript migration).
 *
 * Pure functions that reproduce the composite action's `post`-step markdown: the
 * diff symbol-prefixing, the summary line extraction, length truncation, and the
 * final comment body. The orchestrator supplies the already-resolved command
 * string, console output, and context; this module only formats.
 *
 * Truncation is by Unicode code point (not bytes, per the migration decision),
 * so it never splits a multi-byte character.
 */

/** A parsed plan diff: symbol-prefixed lines and the count of real changes. */
export interface PlanDiff {
  lines: string[];
  /** Number of changed resources (lines not starting with `# `). */
  count: number;
}

/**
 * Turn `terraform show` output into diff-highlighted lines, mirroring the
 * composite action's `grep '^  # ' | sed` symbol-prefixing. Each `  # …` line
 * becomes `+`/`-`/`!`/`~`/`#`-prefixed by its action keyword. First match wins,
 * matching the sequential `sed` rewrite.
 */
export function parseDiff(showOutput: string): PlanDiff {
  const lines: string[] = [];
  for (const raw of showOutput.split("\n")) {
    if (!raw.startsWith("  # ")) continue;
    const rest = raw.slice(4);
    let symbol: string;
    if (rest.includes(" be created")) symbol = "+";
    else if (rest.includes(" be destroyed")) symbol = "-";
    else if (rest.includes(" be updated") || rest.includes(" be replaced"))
      symbol = "!";
    else if (rest.includes(" be read")) symbol = "~";
    else symbol = "#";
    lines.push(`${symbol} ${rest}`);
  }
  const count = lines.filter((line) => !line.startsWith("# ")).length;
  return { lines, count };
}

/**
 * The last meaningful status line from console output, mirroring the composite
 * action's `awk` over `^(Error:|Plan:|Apply complete!|No changes.|Success)`;
 * falls back to "View output." when none is present.
 */
export function parseSummary(consoleOutput: string): string {
  // `No changes.` keeps the composite's unescaped `.` (any char) so a future
  // "No changes:"/"!" variant matches identically to the bash awk.
  const pattern = /^(Error:|Plan:|Apply complete!|No changes.|Success)/;
  let summary = "";
  for (const line of consoleOutput.split("\n")) {
    if (pattern.test(line)) summary = line;
  }
  return summary !== "" ? summary : "View output.";
}

/**
 * Truncate by Unicode code point, appending a `\n…` sentinel when shortened
 * (the composite used a byte limit + `…`; we use code points so a multi-byte
 * character is never split).
 */
export function truncate(text: string, maxCodePoints: number): string {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxCodePoints) return text;
  return `${codePoints.slice(0, maxCodePoints).join("")}\n…`;
}

export interface CommentParts {
  /** `comment-pos-1..6` markdown placeholders, in order. */
  positions: readonly [string, string, string, string, string, string];
  /** The (hide/show-args filtered, secret-scrubbed) command line. */
  command: string;
  /** Parsed diff; rendered as a collapsible block when it has lines. */
  diff: PlanDiff;
  /** Console output (already truncated by the caller). */
  console: string;
  /** Diff text (already truncated by the caller). */
  diffText: string;
  /** Summary line for the collapsible header. */
  summary: string;
  /** Syntax highlight for the console block: `hcl` normally, `diff` on fmt failure. */
  syntax: "hcl" | "diff";
  /** `@` to tag the actor, or `""`. */
  actorTag: string;
  actor: string;
  timestamp: string;
  runUrl: string;
  /** The hidden identifier marker (without the `<!-- -->` wrapper). */
  marker: string;
  expandDiff: boolean;
  expandSummary: boolean;
}

/** The collapsible diff block, or "" when there are no changed-resource lines. */
function renderDiffBlock(parts: CommentParts): string {
  if (parts.diff.lines.length === 0) return "";
  const noun = parts.diff.count === 1 ? "change" : "changes";
  const open = parts.expandDiff ? " open" : "";
  return `
<details${open}><summary>Diff of ${parts.diff.count} ${noun}.</summary>

\`\`\`diff
${parts.diffText}
\`\`\`
</details>`;
}

/**
 * Assemble the full PR-comment / job-summary body, reproducing the composite
 * action's heredoc layout (the six `comment-pos` placeholders, the ```fish
 * command block, the collapsible diff, the collapsible summary with the actor
 * footer and view-log link, the console block, and the trailing identifier
 * marker that the upsert logic keys off).
 */
export function buildCommentBody(parts: CommentParts): string {
  const [pos1, pos2, pos3, pos4, pos5, pos6] = parts.positions;
  const summaryOpen = parts.expandSummary ? " open" : "";
  return `${pos1}
\`\`\`fish
${parts.command}
\`\`\`
${pos2}
${renderDiffBlock(parts)}
${pos3}
<details${summaryOpen}><summary>${parts.summary}</br>

${pos4}
###### By ${parts.actorTag}${parts.actor} at ${parts.timestamp} [(view log)](${parts.runUrl}).
</summary>

\`\`\`${parts.syntax}
${parts.console}
\`\`\`
</details>
${pos5}
<!-- ${parts.marker} -->
${pos6}`;
}
