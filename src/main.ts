import * as core from "@actions/core";
import { buildArgv, buildTFEnv, type Subcommand } from "./args";
import { getInputs } from "./inputs";

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
  core.debug(
    `Parsed inputs for tool '${inputs.tool}', command '${inputs.command || "(none)"}'.`,
  );
  core.debug(`TF environment: ${JSON.stringify(buildTFEnv(inputs))}`);

  const subcommands: Subcommand[] = [
    "init",
    "validate",
    "fmt",
    "plan",
    "apply",
  ];
  for (const sub of subcommands) {
    core.debug(
      `argv[${sub}]: ${JSON.stringify([inputs.tool, ...buildArgv(inputs, sub)])}`,
    );
  }
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
