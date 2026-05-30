import type { ActionInputs, TFArgs } from "./inputs";

/**
 * Argv and environment construction for the Terraform/OpenTofu via PR action
 * (Phase 1 of the TypeScript migration).
 *
 * Replaces the flag-string concatenation half of the composite action's `arg`
 * step. Every argument is built into a `string[]` argv — never a concatenated
 * shell string — so there is no shell parsing and command injection through an
 * input value (e.g. a `-var` containing `"; rm -rf /`) is structurally
 * impossible: each element reaches the binary as one literal argument.
 */

export type Subcommand = "init" | "validate" | "fmt" | "plan" | "apply";

/** A bare boolean flag: `["-name"]` when on, else `[]`. */
function flag(on: boolean, name: string): string[] {
  return on ? [name] : [];
}

/** A value flag: `["-name=value"]` when value is non-empty, else `[]`. */
function kv(value: string, name: string): string[] {
  return value !== "" ? [`${name}=${value}`] : [];
}

/** A repeatable flag: one `-name=value` per value. */
function repeat(values: string[], name: string): string[] {
  return values.map((value) => `${name}=${value}`);
}

/**
 * Build the argv for a terraform/tofu subcommand as a `string[]`.
 *
 * The per-subcommand flag sets mirror the composite action exactly, including:
 * - `-chdir` is a global option placed before the subcommand.
 * - `init`/`validate` only forward `-var-file`/`-var` for `tofu` (terraform
 *   does not accept variables on those subcommands).
 * - `plan` always appends `-out=tfplan`.
 * - `apply` forwards variables only with `-auto-approve`; otherwise it consumes
 *   the saved `tfplan` plan file as a positional argument.
 *
 * The returned argv excludes the binary itself; the caller invokes
 * `exec(inputs.tool, buildArgv(inputs, sub))`.
 */
export function buildArgv(inputs: ActionInputs, sub: Subcommand): string[] {
  const a: TFArgs = inputs.args;
  const isTofu = inputs.tool === "tofu";
  const argv: string[] = [];
  if (a.chdir !== "") argv.push(`-chdir=${a.chdir}`);
  argv.push(sub);

  switch (sub) {
    case "fmt":
      argv.push(
        ...flag(a.check, "-check"),
        ...flag(a.diff, "-diff"),
        ...kv(a.list, "-list"),
        ...flag(a.recursive, "-recursive"),
        ...kv(a.write, "-write"),
      );
      return argv;

    case "init":
      argv.push(
        ...repeat(a.backendConfig, "-backend-config"),
        ...kv(a.backend, "-backend"),
        ...(isTofu ? repeat(a.varFile, "-var-file") : []),
        ...(isTofu ? repeat(a.var, "-var") : []),
        ...flag(a.forceCopy, "-force-copy"),
        ...kv(a.fromModule, "-from-module"),
        ...kv(a.get, "-get"),
        ...kv(a.lockTimeout, "-lock-timeout"),
        ...kv(a.lock, "-lock"),
        ...kv(a.lockfile, "-lockfile"),
        ...flag(a.migrateState, "-migrate-state"),
        ...kv(a.pluginDir, "-plugin-dir"),
        ...flag(a.reconfigure, "-reconfigure"),
        ...kv(a.testDirectory, "-test-directory"),
        ...flag(a.upgrade, "-upgrade"),
      );
      return argv;

    case "validate":
      argv.push(
        ...(isTofu ? repeat(a.varFile, "-var-file") : []),
        ...(isTofu ? repeat(a.var, "-var") : []),
        ...flag(a.noTests, "-no-tests"),
        ...kv(a.testDirectory, "-test-directory"),
      );
      return argv;

    case "plan":
      argv.push(
        ...flag(a.destroy, "-destroy"),
        ...repeat(a.varFile, "-var-file"),
        ...repeat(a.var, "-var"),
        ...flag(a.compactWarnings, "-compact-warnings"),
        ...flag(a.concise, "-concise"),
        ...flag(a.detailedExitcode, "-detailed-exitcode"),
        ...kv(a.generateConfigOut, "-generate-config-out"),
        ...kv(a.lockTimeout, "-lock-timeout"),
        ...kv(a.lock, "-lock"),
        ...kv(a.parallelism, "-parallelism"),
        ...flag(a.refreshOnly, "-refresh-only"),
        ...kv(a.refresh, "-refresh"),
        ...repeat(a.replace, "-replace"),
        ...repeat(a.target, "-target"),
        "-out=tfplan",
      );
      return argv;

    case "apply":
      argv.push(
        ...flag(a.destroy, "-destroy"),
        ...(a.autoApprove ? repeat(a.varFile, "-var-file") : []),
        ...(a.autoApprove ? repeat(a.var, "-var") : []),
        ...kv(a.backup, "-backup"),
        ...flag(a.compactWarnings, "-compact-warnings"),
        ...flag(a.concise, "-concise"),
        ...kv(a.lockTimeout, "-lock-timeout"),
        ...kv(a.lock, "-lock"),
        ...kv(a.parallelism, "-parallelism"),
        ...flag(a.refreshOnly, "-refresh-only"),
        ...kv(a.refresh, "-refresh"),
        ...repeat(a.replace, "-replace"),
        ...kv(a.stateOut, "-state-out"),
        ...kv(a.state, "-state"),
        ...repeat(a.target, "-target"),
        ...(a.autoApprove ? ["-auto-approve"] : ["tfplan"]),
      );
      return argv;
  }
}

/**
 * Build the `TF_*` environment the composite action exported via `$GITHUB_ENV`:
 * appends `-no-color` to any existing `TF_CLI_ARGS`, forces automation mode, and
 * resolves the workspace from an existing `TF_WORKSPACE` or the `arg-workspace`
 * input. Pure and side-effect free so it is unit-testable; the caller applies it
 * via `core.exportVariable` in a later phase.
 */
export function buildTFEnv(
  inputs: ActionInputs,
  procEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const existing = (procEnv.TF_CLI_ARGS ?? "").trim();
  return {
    TF_CLI_ARGS: existing !== "" ? `${existing} -no-color` : "-no-color",
    TF_IN_AUTOMATION: "true",
    TF_INPUT: "false",
    TF_WORKSPACE:
      procEnv.TF_WORKSPACE && procEnv.TF_WORKSPACE !== ""
        ? procEnv.TF_WORKSPACE
        : inputs.args.workspace,
  };
}
