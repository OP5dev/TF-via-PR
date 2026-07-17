import * as core from "@actions/core";
import { buildArgv, buildTFEnv, type Subcommand } from "./args";
import { getInputs } from "./inputs";

const SUBCOMMANDS: readonly Subcommand[] = [
  "init",
  "validate",
  "fmt",
  "plan",
  "apply",
];

/**
 * Entry point for the Terraform/OpenTofu via PR action.
 *
 * Phase 1 (input parsing + argv construction): parses the typed input contract
 * and constructs the terraform/tofu argv as a `string[]`. The action is still
 * driven by the composite `action.yml`, so this entry point only logs debug
 * output for now; later phases (exec, github, artifact, crypto, comment) move
 * the remaining logic here and flip `action.yml` to `using: node`.
 */
async function run(): Promise<void> {
  const inputs = getInputs();

  // Debug logging is intentionally non-sensitive: argv tokens (e.g. `-var=...`)
  // and environment values can carry secrets and may surface in workflow logs
  // when runner debugging is enabled, so log only summaries — the subcommand,
  // the argv token count, and the environment variable names (never values).
  core.debug(
    `Parsed inputs for tool '${inputs.tool}', command '${inputs.command || "(none)"}'.`,
  );
  core.debug(
    `TF environment variables: ${Object.keys(buildTFEnv(inputs)).join(", ")}.`,
  );
  for (const sub of SUBCOMMANDS) {
    core.debug(`argv[${sub}]: ${buildArgv(inputs, sub).length} tokens.`);
  }
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
