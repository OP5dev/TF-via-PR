import * as exec from "@actions/exec";
import { buildArgv, buildTFEnv } from "./args";
import type { ActionInputs, Tool } from "./inputs";

/**
 * Terraform/OpenTofu subprocess execution (Phase 2 of the TypeScript migration).
 *
 * Replaces the inline `bash` invocations of the composite action's `format`,
 * `initialize`, `validate`, `plan`, `apply`, and `show` steps. Every command is
 * run via `@actions/exec` with an explicit `string[]` argv — never a shell
 * string — so there is no shell parsing or word-splitting, and an input value
 * cannot inject a second command.
 *
 * The recommended shape is a single low-level primitive (`runTF`) plus thin,
 * command-specific wrappers. The primitive owns the cross-cutting concerns
 * (stream capture, exit-code policy, secret scrubbing, env); each wrapper only
 * declares which subcommand to build and which exit codes are acceptable.
 */

/** Result of a terraform/tofu invocation. */
export interface TFResult {
  /** Process exit code. */
  exitCode: number;
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
  /**
   * True when `terraform plan -detailed-exitcode` returned 2 ("changes
   * present"). Always false for other commands and exit codes.
   */
  hasChanges: boolean;
  /** The secret-scrubbed command line, for logging and the PR comment. */
  command: string;
}

export interface RunOptions {
  /** Working directory; defaults to the process cwd (`-chdir` handles the rest). */
  cwd?: string;
  /** Extra environment merged over `process.env`. */
  env?: Record<string, string>;
  /** Exit codes that are NOT failures. Defaults to `[0]`. */
  okCodes?: number[];
  /** When true, never throw on a non-zero exit (e.g. `fmt -check`). */
  allowAnyExitCode?: boolean;
  /** Secret values to redact from the stored `command` (and error message). */
  secrets?: string[];
  /** Suppress live echo to the Actions log. Output is still captured. */
  silent?: boolean;
}

/** Thrown when a command exits with a code outside its accepted set. */
export class TFError extends Error {
  constructor(
    readonly tool: Tool,
    readonly command: string,
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(`${tool} exited with code ${exitCode}: ${command}`);
    this.name = "TFError";
  }
}

/** Replace every occurrence of each secret with `***`. */
function scrub(text: string, secrets: readonly string[] = []): string {
  let result = text;
  for (const secret of secrets) {
    if (secret !== "") result = result.split(secret).join("***");
  }
  return result;
}

/**
 * Run a terraform/tofu command. Captures stdout/stderr in real time (streamed
 * to the Actions log and accumulated for parsing), applies the exit-code policy,
 * and returns a {@link TFResult}. Binary-agnostic: identical for `terraform` and
 * `tofu`.
 */
export async function runTF(
  tool: Tool,
  argv: string[],
  options: RunOptions = {},
): Promise<TFResult> {
  const okCodes = options.okCodes ?? [0];
  const command = scrub([tool, ...argv].join(" "), options.secrets);

  let stdout = "";
  let stderr = "";

  const execOptions: exec.ExecOptions = {
    env: { ...process.env, ...options.env } as Record<string, string>,
    ignoreReturnCode: true,
    silent: options.silent ?? false,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
      },
    },
  };
  // Assigned conditionally: `cwd` is non-optional in ExecOptions and
  // exactOptionalPropertyTypes forbids passing `undefined`.
  if (options.cwd !== undefined) execOptions.cwd = options.cwd;

  const exitCode = await exec.exec(tool, argv, execOptions);

  if (!options.allowAnyExitCode && !okCodes.includes(exitCode)) {
    throw new TFError(tool, command, exitCode, scrub(stderr, options.secrets));
  }

  return { exitCode, stdout, stderr, hasChanges: exitCode === 2, command };
}

/** Secrets that must never appear in logs or the PR comment. */
function secretsOf(inputs: ActionInputs): string[] {
  return [inputs.planEncrypt, inputs.token].filter((value) => value !== "");
}

function baseOptions(inputs: ActionInputs): RunOptions {
  return { env: buildTFEnv(inputs), secrets: secretsOf(inputs) };
}

export function runFmt(inputs: ActionInputs): Promise<TFResult> {
  // `fmt -check` exits non-zero when files would be reformatted; that is a
  // reportable diff, not a hard failure, so never throw.
  return runTF(inputs.tool, buildArgv(inputs, "fmt"), {
    ...baseOptions(inputs),
    allowAnyExitCode: true,
  });
}

export function runInit(inputs: ActionInputs): Promise<TFResult> {
  return runTF(inputs.tool, buildArgv(inputs, "init"), baseOptions(inputs));
}

export function runValidate(inputs: ActionInputs): Promise<TFResult> {
  return runTF(inputs.tool, buildArgv(inputs, "validate"), baseOptions(inputs));
}

/** `plan -detailed-exitcode`: exit code 2 ("changes present") is success. */
export function runPlan(inputs: ActionInputs): Promise<TFResult> {
  return runTF(inputs.tool, buildArgv(inputs, "plan"), {
    ...baseOptions(inputs),
    okCodes: [0, 2],
  });
}

export function runApply(inputs: ActionInputs): Promise<TFResult> {
  return runTF(inputs.tool, buildArgv(inputs, "apply"), baseOptions(inputs));
}

/** `show` the saved plan file (parsed by the caller, so output is not streamed). */
export function runShow(
  inputs: ActionInputs,
  planFile = "tfplan",
): Promise<TFResult> {
  const chdir = inputs.args.chdir;
  const argv = [...(chdir !== "" ? [`-chdir=${chdir}`] : []), "show", planFile];
  return runTF(inputs.tool, argv, { ...baseOptions(inputs), silent: true });
}
