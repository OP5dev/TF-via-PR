import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildArtifactName,
  downloadPlan,
  uploadPlan,
  type PlanArtifactClient,
} from "../src/artifact";
import type { ActionInputs, TFArgs } from "../src/inputs";

function makeInputs(
  tool: "terraform" | "tofu",
  args: Partial<TFArgs> = {},
): ActionInputs {
  const base: TFArgs = {
    autoApprove: false,
    check: true,
    compactWarnings: false,
    concise: false,
    destroy: false,
    detailedExitcode: true,
    diff: true,
    forceCopy: false,
    migrateState: false,
    noTests: false,
    reconfigure: false,
    recursive: true,
    refreshOnly: false,
    upgrade: false,
    backend: "",
    backup: "",
    chdir: "",
    fromModule: "",
    generateConfigOut: "",
    get: "",
    list: "",
    lock: "",
    lockTimeout: "",
    lockfile: "",
    parallelism: "",
    pluginDir: "",
    refresh: "",
    state: "",
    stateOut: "",
    testDirectory: "",
    write: "",
    backendConfig: [],
    replace: [],
    target: [],
    var: [],
    varFile: [],
    workspace: "",
    ...args,
  };
  return {
    tool,
    command: "plan",
    format: false,
    validate: false,
    workingDirectory: "",
    planFile: "",
    planEncrypt: "",
    planParity: false,
    preservePlan: false,
    uploadPlan: true,
    retentionDays: "",
    commentMethod: "update",
    commentPr: "always",
    commentPos: ["", "", "", "", "", ""],
    expandDiff: false,
    expandSummary: false,
    hideArgs: [],
    showArgs: [],
    tagActor: "always",
    prNumber: "",
    token: "",
    args: base,
  };
}

/** In-memory artifact transport: upload stores bytes by id, download writes them back. */
function fakeTransport() {
  const store = new Map<number, Buffer>();
  const calls: Record<string, unknown>[] = [];
  let nextId = 100;
  const client: PlanArtifactClient = {
    uploadArtifact: async (name, files, _rootDirectory, options) => {
      const content = readFileSync(files[0] ?? "");
      const id = nextId++;
      store.set(id, content);
      calls.push({ op: "upload", name, content, options });
      return { id, size: content.length };
    },
    downloadArtifact: async (artifactId, options) => {
      const dir = options?.path ?? tmpdir();
      writeFileSync(
        join(dir, "tfplan"),
        store.get(artifactId) ?? Buffer.alloc(0),
      );
      calls.push({ op: "download", artifactId, findBy: options?.findBy });
      return { downloadPath: dir };
    },
  };
  return { store, calls, client };
}

function tmpFile(name: string, content: Buffer | string): string {
  const dir = mkdtempSync(join(tmpdir(), "tf-via-pr-test-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("buildArtifactName (byte-compatible with the composite md5)", () => {
  test("chdir + workspace", () => {
    const inputs = makeInputs("terraform", {
      chdir: "stacks/dev",
      workspace: "dev",
    });
    expect(buildArtifactName(inputs, 7)).toBe(
      "terraform-7-440a62c41fc0bef301d75402aab8b998.tfplan",
    );
  });

  test("repeated flags + destroy", () => {
    const inputs = makeInputs("terraform", {
      chdir: "stacks/dev",
      workspace: "dev",
      backendConfig: ["a.tfvars", "b.tfvars"],
      var: ["x=1"],
      target: ["m"],
      destroy: true,
    });
    expect(buildArtifactName(inputs, 7)).toBe(
      "terraform-7-6bbb94ee4b1e97c5e3245db5f6ef54ab.tfplan",
    );
  });

  test("no plan-identity inputs hashes the empty string", () => {
    expect(buildArtifactName(makeInputs("tofu"), 0)).toBe(
      "tofu-0-d41d8cd98f00b204e9800998ecf8427e.tfplan",
    );
  });
});

describe("uploadPlan", () => {
  test("encrypts the plan when a passphrase is set and forwards retentionDays", async () => {
    const transport = fakeTransport();
    const planPath = tmpFile("tfplan", "binary-plan-bytes");
    await uploadPlan({
      name: "terraform-7-abc.tfplan",
      planPath,
      passphrase: "pw",
      retentionDays: 7,
      client: transport.client,
    });
    const upload = transport.calls.find((c) => c.op === "upload");
    const content = upload?.content as Buffer;
    expect(content.subarray(0, 8).toString("latin1")).toBe("Salted__"); // encrypted
    expect((upload?.options as { retentionDays?: number }).retentionDays).toBe(
      7,
    );
  });

  test("uploads the plan unencrypted when no passphrase is set", async () => {
    const transport = fakeTransport();
    const planPath = tmpFile("tfplan", "plain-plan");
    await uploadPlan({
      name: "n",
      planPath,
      passphrase: "",
      client: transport.client,
    });
    const content = transport.calls[0]?.content as Buffer;
    expect(content.toString()).toBe("plain-plan");
  });
});

describe("plan round-trip through the artifact transport", () => {
  test("encrypt -> upload -> download -> decrypt restores the plan", async () => {
    const transport = fakeTransport();
    const planText = "terraform plan output\nPlan: 1 to add.";
    const planPath = tmpFile("tfplan", planText);

    const { id } = await uploadPlan({
      name: "terraform-7-abc.tfplan",
      planPath,
      passphrase: "s3cret",
      client: transport.client,
    });
    // the stored bytes are ciphertext, not the plaintext
    expect(transport.store.get(id)?.toString().startsWith("Salted__")).toBe(
      true,
    );

    const destPath = join(
      mkdtempSync(join(tmpdir(), "tf-via-pr-test-")),
      "tfplan",
    );
    await downloadPlan({
      artifactId: id,
      workflowRunId: 4242,
      destPath,
      passphrase: "s3cret",
      token: "tok",
      owner: "op5dev",
      repo: "tf-via-pr",
      client: transport.client,
    });

    expect(readFileSync(destPath).toString()).toBe(planText);
    const download = transport.calls.find((c) => c.op === "download");
    expect((download?.findBy as { workflowRunId: number }).workflowRunId).toBe(
      4242,
    );
  });
});

describe("downloadPlan error handling", () => {
  test("throws a clear error when the artifact has no plan file", async () => {
    const client: PlanArtifactClient = {
      uploadArtifact: async () => ({ id: 1, size: 0 }),
      downloadArtifact: async (_id, options) => ({
        downloadPath: options?.path ?? "",
      }), // writes nothing
    };
    const destPath = join(
      mkdtempSync(join(tmpdir(), "tf-via-pr-test-")),
      "tfplan",
    );
    await expect(
      downloadPlan({
        artifactId: 9,
        workflowRunId: 1,
        destPath,
        passphrase: "",
        token: "t",
        owner: "o",
        repo: "r",
        client,
      }),
    ).rejects.toThrow(/did not contain/);
  });
});
