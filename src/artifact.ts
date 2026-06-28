import {
  DefaultArtifactClient,
  type ArtifactClient,
  type UploadArtifactOptions,
} from "@actions/artifact";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decrypt, encrypt } from "./crypto";
import type { ActionInputs } from "./inputs";

/**
 * Plan-artifact naming, upload, and download (Phase 4 of the TypeScript
 * migration). Replaces the composite action's `md5sum` naming, the nested
 * `upload-artifact` step, and the `gh api .../zip` + `unzip` download, using
 * `@actions/artifact` v2 and `node:crypto`.
 *
 * `@actions/artifact` v2 derives its service URL/token from the runner
 * environment, so github.com, `*.ghe.com` (incl. EU residency), and GHES with
 * the artifact backend all work with no extra configuration — which is why the
 * old v3-vs-v7 upload split is gone (Q2).
 */

/** The single file stored inside the artifact (content encrypted when a passphrase is set). */
const PLAN_FILENAME = "tfplan";

/** Minimal slice of `ArtifactClient` this module uses; injectable for tests. */
export interface PlanArtifactClient {
  uploadArtifact: ArtifactClient["uploadArtifact"];
  downloadArtifact: ArtifactClient["downloadArtifact"];
}

const kvFragment = (name: string, value: string): string =>
  value !== "" ? ` -${name}=${value}` : "";
const repeatFragment = (name: string, values: string[]): string =>
  values.map((value) => ` -${name}=${value}`).join("");
const flagFragment = (name: string, on: boolean): string =>
  on ? ` -${name}` : "";

/**
 * Build the unique artifact name, byte-compatible with the composite action:
 * an md5 over the space-prefixed formatted forms of the plan-identity inputs
 * (chdir, workspace, backend-config, var-file, var, replace, target, destroy),
 * formatted `<tool>-<pr>-<md5>.tfplan`. Reproducing the exact source string
 * keeps names stable across the migration so an apply finds its plan.
 */
export function buildArtifactName(
  inputs: ActionInputs,
  prNumber: number,
): string {
  const a = inputs.args;
  const source =
    kvFragment("chdir", a.chdir) +
    kvFragment("workspace", a.workspace) +
    repeatFragment("backend-config", a.backendConfig) +
    repeatFragment("var-file", a.varFile) +
    repeatFragment("var", a.var) +
    repeatFragment("replace", a.replace) +
    repeatFragment("target", a.target) +
    flagFragment("destroy", a.destroy);
  const digest = createHash("md5").update(source, "utf8").digest("hex");
  return `${inputs.tool}-${prNumber}-${digest}.tfplan`;
}

export interface UploadPlanOptions {
  name: string;
  /** Path to the plaintext plan file on disk. */
  planPath: string;
  /** Encryption passphrase; "" uploads the plan unencrypted. */
  passphrase: string;
  retentionDays?: number;
  client?: PlanArtifactClient;
}

/**
 * Encrypt the plan (when a passphrase is set) and upload it as a single-file
 * artifact. Returns the artifact id (0 if the backend did not report one).
 */
export async function uploadPlan(
  options: UploadPlanOptions,
): Promise<{ id: number }> {
  const client = options.client ?? new DefaultArtifactClient();
  const plan = readFileSync(options.planPath);
  const payload =
    options.passphrase !== "" ? encrypt(plan, options.passphrase) : plan;

  const dir = mkdtempSync(join(tmpdir(), "tf-via-pr-"));
  try {
    const file = join(dir, PLAN_FILENAME);
    writeFileSync(file, payload);

    const uploadOptions: UploadArtifactOptions = {};
    if (options.retentionDays !== undefined)
      uploadOptions.retentionDays = options.retentionDays;

    const { id } = await client.uploadArtifact(
      options.name,
      [file],
      dir,
      uploadOptions,
    );
    return { id: id ?? 0 };
  } finally {
    // Remove the temp copy (a plaintext plan when no passphrase) promptly,
    // rather than leaving it under the runner temp dir on self-hosted runners.
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface DownloadPlanOptions {
  /** Artifact id, from `GitHubClient.findArtifact`. */
  artifactId: number;
  /** Source run id, for cross-run download (plan run vs. apply run). */
  workflowRunId: number;
  /** Where to write the decrypted plan file. */
  destPath: string;
  passphrase: string;
  token: string;
  owner: string;
  repo: string;
  client?: PlanArtifactClient;
}

/**
 * Download the plan artifact from its (possibly different) source run, decrypt
 * it when a passphrase is set, and write it to `destPath`. Throws a clear error
 * if the artifact does not contain the expected plan file.
 */
export async function downloadPlan(
  options: DownloadPlanOptions,
): Promise<void> {
  if (options.workflowRunId <= 0) {
    throw new Error(
      `Cannot download plan artifact ${options.artifactId}: missing or invalid source workflow run id.`,
    );
  }

  const client = options.client ?? new DefaultArtifactClient();
  const dir = mkdtempSync(join(tmpdir(), "tf-via-pr-"));
  try {
    await client.downloadArtifact(options.artifactId, {
      path: dir,
      findBy: {
        token: options.token,
        repositoryOwner: options.owner,
        repositoryName: options.repo,
        workflowRunId: options.workflowRunId,
      },
    });

    let downloaded: Buffer;
    try {
      downloaded = readFileSync(join(dir, PLAN_FILENAME));
    } catch (error) {
      // Only a genuinely-missing file means "the artifact lacked the plan";
      // surface any other I/O error as-is rather than mislabelling it.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `Plan artifact ${options.artifactId} did not contain a '${PLAN_FILENAME}' file.`,
        );
      }
      throw error;
    }

    const plan =
      options.passphrase !== ""
        ? decrypt(downloaded, options.passphrase)
        : downloaded;
    writeFileSync(options.destPath, plan);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
