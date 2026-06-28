import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ActionInputs, TFArgs } from "../src/inputs";

/**
 * Mock `@actions/exec` at the module boundary. The mock records the last call,
 * pushes configurable output to the listeners, and returns a configurable exit
 * code, so tests drive exit-code policy and stream capture without a real binary.
 */
let lastCall: { cmd: string; args: string[]; opts: MockExecOptions } | null =
  null;
let nextExit = 0;
let stdoutChunk = "";
let stderrChunk = "";

interface MockExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  silent?: boolean;
  ignoreReturnCode?: boolean;
  listeners?: { stdout?: (b: Buffer) => void; stderr?: (b: Buffer) => void };
}

const execMock = mock(
  async (cmd: string, args: string[], opts: MockExecOptions) => {
    lastCall = { cmd, args, opts };
    if (stdoutChunk !== "") opts.listeners?.stdout?.(Buffer.from(stdoutChunk));
    if (stderrChunk !== "") opts.listeners?.stderr?.(Buffer.from(stderrChunk));
    return nextExit;
  },
);

mock.module("@actions/exec", () => ({ exec: execMock }));

const { runTF, runPlan, runFmt, runShow, TFError } =
  await import("../src/exec");

beforeEach(() => {
  lastCall = null;
  nextExit = 0;
  stdoutChunk = "";
  stderrChunk = "";
  execMock.mockClear();
});

function makeInputs(
  overrides: Partial<TFArgs> = {},
  top: Partial<ActionInputs> = {},
): ActionInputs {
  const args: TFArgs = {
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
    ...overrides,
  };
  return {
    tool: "terraform",
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
    args,
    ...top,
  };
}

describe("runTF exit-code policy", () => {
  test("plan -detailed-exitcode exit 2 with detectChanges is success + hasChanges", async () => {
    nextExit = 2;
    stdoutChunk = "Plan: 1 to add, 0 to change, 0 to destroy.";
    const result = await runTF("terraform", ["plan", "-detailed-exitcode"], {
      okCodes: [0, 2],
      detectChanges: true,
    });
    expect(result.exitCode).toBe(2);
    expect(result.hasChanges).toBe(true);
    expect(result.stdout).toContain("Plan: 1 to add");
  });

  test("exit 2 without detectChanges does not set hasChanges", async () => {
    nextExit = 2;
    const result = await runTF("terraform", ["validate"], { okCodes: [0, 2] });
    expect(result.exitCode).toBe(2);
    expect(result.hasChanges).toBe(false);
  });

  test("exit code outside okCodes throws TFError", async () => {
    nextExit = 1;
    stderrChunk = "Error: invalid";
    await expect(
      runTF("tofu", ["plan"], { okCodes: [0, 2] }),
    ).rejects.toBeInstanceOf(TFError);
  });

  test("exit 0 has hasChanges false", async () => {
    nextExit = 0;
    const result = await runTF("terraform", ["init"]);
    expect(result.hasChanges).toBe(false);
  });

  test("allowAnyExitCode never throws", async () => {
    nextExit = 3;
    const result = await runTF("terraform", ["fmt", "-check"], {
      allowAnyExitCode: true,
    });
    expect(result.exitCode).toBe(3);
  });
});

describe("runTF invocation safety", () => {
  test("passes argv as a string[] to exec, never a shell string", async () => {
    await runTF("terraform", ["-chdir=x", "plan", "-var=a=b"]);
    expect(lastCall?.cmd).toBe("terraform");
    expect(lastCall?.args).toEqual(["-chdir=x", "plan", "-var=a=b"]);
    expect(lastCall?.opts.ignoreReturnCode).toBe(true);
  });

  test("scrubs secrets from the recorded command", async () => {
    const result = await runTF("terraform", ["plan", "-var=pass=s3cr3t"], {
      secrets: ["s3cr3t"],
    });
    expect(result.command).toBe("terraform plan -var=pass=***");
    expect(result.command).not.toContain("s3cr3t");
  });

  test("quotes only the argv tokens that contain whitespace/metacharacters", async () => {
    const result = await runTF("terraform", [
      "plan",
      "-var=name=hello world",
      "-input=false",
    ]);
    // safe tokens stay bare; the one with a space is single-quoted and copy-pasteable
    expect(result.command).toBe(
      "terraform plan '-var=name=hello world' -input=false",
    );
  });

  test("merges env over process.env and forwards cwd", async () => {
    await runTF("terraform", ["init"], {
      cwd: "/work",
      env: { TF_IN_AUTOMATION: "true" },
    });
    expect(lastCall?.opts.cwd).toBe("/work");
    expect(lastCall?.opts.env?.TF_IN_AUTOMATION).toBe("true");
  });
});

describe("command wrappers", () => {
  test("runPlan tolerates exit 2 (changes) without throwing", async () => {
    nextExit = 2;
    const result = await runPlan(makeInputs());
    expect(result.hasChanges).toBe(true);
    // -detailed-exitcode and -out=tfplan come from buildArgv
    expect(lastCall?.args).toContain("-detailed-exitcode");
    expect(lastCall?.args.at(-1)).toBe("-out=tfplan");
  });

  test("runFmt does not throw when files need formatting", async () => {
    nextExit = 3;
    const result = await runFmt(makeInputs());
    expect(result.exitCode).toBe(3);
    expect(lastCall?.args[0]).toBe("fmt");
  });

  test("runShow targets the plan file under -chdir and is silent", async () => {
    await runShow(makeInputs({ chdir: "stacks/dev" }));
    expect(lastCall?.args).toEqual(["-chdir=stacks/dev", "show", "tfplan"]);
    expect(lastCall?.opts.silent).toBe(true);
  });
});
