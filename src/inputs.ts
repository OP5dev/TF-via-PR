import * as core from "@actions/core";

/**
 * Typed input schema and parsing for the Terraform/OpenTofu via PR action
 * (Phase 1 of the TypeScript migration).
 *
 * This module replaces the input-reading half of the composite action's `arg`
 * step. Argv and environment construction live in the sibling `args` module,
 * matching the module taxonomy (inputs, args, exec, …) established by the
 * Phase 0 scaffold (#563).
 *
 * Naming follows the project convention of `TF` (not `Terraform`) for code
 * identifiers; user-facing strings continue to say "Terraform/OpenTofu".
 */

export type Tool = "terraform" | "tofu";
export type Command = "" | "plan" | "apply" | "init";
export type CommentMethod = "update" | "recreate";
export type CommentPr = "always" | "on-diff" | "never";
export type TagActor = "always" | "on-diff" | "never";

/**
 * Every `arg-*` input from `action.yml`, parsed into its natural type.
 *
 * - boolean: bare flags emitted as `-name` when true (e.g. `-auto-approve`).
 * - string: value flags emitted as `-name=value` when non-empty.
 * - string[]: repeatable flags split on `,` and emitted once per value
 *   (e.g. `-target=a -target=b`). Comma-splitting reproduces the composite
 *   action's `sed` behaviour exactly, including its inability to represent a
 *   value that itself contains a comma — preserved for zero behaviour change.
 */
export interface TFArgs {
  // bare boolean flags
  autoApprove: boolean;
  check: boolean;
  compactWarnings: boolean;
  concise: boolean;
  destroy: boolean;
  detailedExitcode: boolean;
  diff: boolean;
  forceCopy: boolean;
  migrateState: boolean;
  noTests: boolean;
  reconfigure: boolean;
  recursive: boolean;
  refreshOnly: boolean;
  upgrade: boolean;
  // value flags (-name=value)
  backend: string;
  backup: string;
  chdir: string; // arg-chdir, falling back to working-directory
  fromModule: string;
  generateConfigOut: string;
  get: string;
  list: string;
  lock: string;
  lockTimeout: string;
  lockfile: string;
  parallelism: string;
  pluginDir: string;
  refresh: string;
  state: string;
  stateOut: string;
  testDirectory: string;
  write: string;
  // repeatable flags (CSV -> repeated -name=value)
  backendConfig: string[];
  replace: string[];
  target: string[];
  var: string[];
  varFile: string[];
  // workspace is exposed via the TF_WORKSPACE env var, not as a plan/apply flag
  workspace: string;
}

/** The full, typed `action.yml` input contract. */
export interface ActionInputs {
  // action parameters
  tool: Tool;
  command: Command;
  format: boolean;
  validate: boolean;
  workingDirectory: string;
  // plan / artifact
  planFile: string;
  planEncrypt: string;
  planParity: boolean;
  preservePlan: boolean;
  uploadPlan: boolean;
  retentionDays: string;
  // comment / summary
  commentMethod: CommentMethod;
  commentPr: CommentPr;
  commentPos: readonly [string, string, string, string, string, string];
  expandDiff: boolean;
  expandSummary: boolean;
  hideArgs: string[];
  showArgs: string[];
  tagActor: TagActor;
  // context / auth
  prNumber: string;
  token: string;
  // CLI argument bundle
  args: TFArgs;
}

// ── input readers (faithful to the composite action's bash semantics) ─────────

/** Trimmed string input, or `fallback` when unset. */
function str(name: string, fallback = ""): string {
  const value = core.getInput(name);
  return value !== "" ? value : fallback;
}

/**
 * Boolean input matching the bash `[[ "${X,,}" == "true" ]]` semantics: only a
 * case-insensitive "true" is true; everything else (including "") is false.
 * Deliberately not `core.getBooleanInput`, which throws on non-boolean values.
 */
function bool(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name);
  return (raw !== "" ? raw : String(fallback)).toLowerCase() === "true";
}

/** Comma-separated input split into trimmed, non-empty values. */
function list(name: string): string[] {
  return str(name)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function parseTool(): Tool {
  const value = str("tool", "terraform");
  if (value !== "terraform" && value !== "tofu") {
    throw new Error(
      `Invalid 'tool' input: '${value}'. Expected 'terraform' or 'tofu'.`,
    );
  }
  return value;
}

function parseCommand(): Command {
  const value = str("command");
  if (
    value !== "" &&
    value !== "plan" &&
    value !== "apply" &&
    value !== "init"
  ) {
    throw new Error(
      `Invalid 'command' input: '${value}'. Expected 'plan', 'apply', 'init', or empty.`,
    );
  }
  return value;
}

function parseCommentMethod(): CommentMethod {
  const value = str("comment-method", "update");
  if (value !== "update" && value !== "recreate") {
    throw new Error(
      `Invalid 'comment-method' input: '${value}'. Expected 'update' or 'recreate'.`,
    );
  }
  return value;
}

/**
 * `on-change` is normalised to `on-diff` with a deprecation warning: the two
 * were byte-for-byte identical in the composite action, so the alias is being
 * retired to remove ambiguity.
 */
function parseCommentPr(): CommentPr {
  let value = str("comment-pr", "always");
  if (value === "on-change") {
    core.warning(
      "Input 'comment-pr: on-change' is deprecated; use 'on-diff'. Treating as 'on-diff'.",
    );
    value = "on-diff";
  }
  if (value !== "always" && value !== "on-diff" && value !== "never") {
    throw new Error(
      `Invalid 'comment-pr' input: '${value}'. Expected 'always', 'on-diff', or 'never'.`,
    );
  }
  return value;
}

/** `always`/`true` and `on-diff`/`on-change` aliases are preserved for tag-actor. */
function parseTagActor(): TagActor {
  const value = str("tag-actor", "always");
  if (value === "always" || value === "true") return "always";
  if (value === "on-diff" || value === "on-change") return "on-diff";
  if (value === "never") return "never";
  throw new Error(
    `Invalid 'tag-actor' input: '${value}'. Expected 'always', 'on-diff', or 'never'.`,
  );
}

function parseArgs(): TFArgs {
  return {
    autoApprove: bool("arg-auto-approve", false),
    check: bool("arg-check", true),
    compactWarnings: bool("arg-compact-warnings", false),
    concise: bool("arg-concise", false),
    destroy: bool("arg-destroy", false),
    detailedExitcode: bool("arg-detailed-exitcode", true),
    diff: bool("arg-diff", true),
    forceCopy: bool("arg-force-copy", false),
    migrateState: bool("arg-migrate-state", false),
    noTests: bool("arg-no-tests", false),
    reconfigure: bool("arg-reconfigure", false),
    recursive: bool("arg-recursive", true),
    refreshOnly: bool("arg-refresh-only", false),
    upgrade: bool("arg-upgrade", false),
    backend: str("arg-backend"),
    backup: str("arg-backup"),
    chdir: str("arg-chdir", str("working-directory")),
    fromModule: str("arg-from-module"),
    generateConfigOut: str("arg-generate-config-out"),
    get: str("arg-get"),
    list: str("arg-list"),
    lock: str("arg-lock"),
    lockTimeout: str("arg-lock-timeout"),
    lockfile: str("arg-lockfile"),
    parallelism: str("arg-parallelism"),
    pluginDir: str("arg-plugin-dir"),
    refresh: str("arg-refresh"),
    state: str("arg-state"),
    stateOut: str("arg-state-out"),
    testDirectory: str("arg-test-directory"),
    write: str("arg-write"),
    backendConfig: list("arg-backend-config"),
    replace: list("arg-replace"),
    target: list("arg-target"),
    var: list("arg-var"),
    varFile: list("arg-var-file"),
    workspace: str("arg-workspace"),
  };
}

/** Parse and validate the full `action.yml` input contract. */
export function getInputs(): ActionInputs {
  return {
    tool: parseTool(),
    command: parseCommand(),
    format: bool("format", false),
    validate: bool("validate", false),
    workingDirectory: str("working-directory"),
    planFile: str("plan-file"),
    planEncrypt: str("plan-encrypt"),
    planParity: bool("plan-parity", false),
    preservePlan: bool("preserve-plan", false),
    uploadPlan: bool("upload-plan", true),
    retentionDays: str("retention-days"),
    commentMethod: parseCommentMethod(),
    commentPr: parseCommentPr(),
    commentPos: [
      str("comment-pos-1", "<!-- comment-pos-1 -->"),
      str("comment-pos-2", "<!-- comment-pos-2 -->"),
      str("comment-pos-3", "<!-- comment-pos-3 -->"),
      str("comment-pos-4", "<!-- comment-pos-4 -->"),
      str("comment-pos-5", "<!-- comment-pos-5 -->"),
      str("comment-pos-6", "<!-- comment-pos-6 -->"),
    ],
    expandDiff: bool("expand-diff", false),
    expandSummary: bool("expand-summary", false),
    hideArgs: list("hide-args"),
    showArgs: list("show-args"),
    tagActor: parseTagActor(),
    prNumber: str("pr-number"),
    token: str("token"),
    args: parseArgs(),
  };
}
