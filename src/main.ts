import * as core from "@actions/core";

/**
 * Entry point for the Terraform/OpenTofu via PR action.
 *
 * Phase 0 (scaffold): this is an intentional placeholder that establishes the
 * `node` runtime entry point and the top-level error boundary. The action is
 * still driven by the composite `action.yml`; subsequent phases move logic into
 * dedicated modules (inputs, args, exec, github, artifact, crypto, comment) and
 * wire them in here. See the migration plan for phase boundaries.
 */
async function run(): Promise<void> {
  core.info("tf-via-pr TypeScript entry point (scaffold).");
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
