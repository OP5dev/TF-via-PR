import { describe, expect, test } from "bun:test";
import { buildArgv, buildTFEnv } from "../src/args";
import type { ActionInputs, TFArgs } from "../src/inputs";

/** A fully-defaulted TFArgs, overridable per test. */
function makeArgs(overrides: Partial<TFArgs> = {}): TFArgs {
  return {
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
}

function makeInputs(
  tool: "terraform" | "tofu",
  args: Partial<TFArgs> = {},
): ActionInputs {
  return {
    tool,
    command: "",
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
    args: makeArgs(args),
  };
}

describe("buildArgv: plan", () => {
  test("default plan places -chdir first and -out=tfplan last", () => {
    const argv = buildArgv(
      makeInputs("terraform", { chdir: "stacks/dev" }),
      "plan",
    );
    expect(argv[0]).toBe("-chdir=stacks/dev");
    expect(argv[1]).toBe("plan");
    expect(argv).toContain("-detailed-exitcode");
    expect(argv[argv.length - 1]).toBe("-out=tfplan");
  });

  test("repeatable flags emit one token per value", () => {
    const argv = buildArgv(
      makeInputs("terraform", { target: ["a", "b"], var: ["x=1"] }),
      "plan",
    );
    expect(argv).toContain("-target=a");
    expect(argv).toContain("-target=b");
    expect(argv).toContain("-var=x=1");
  });

  test("value flags are omitted when empty and present when set", () => {
    expect(buildArgv(makeInputs("terraform"), "plan")).not.toContain(
      "-parallelism=",
    );
    const argv = buildArgv(
      makeInputs("terraform", { parallelism: "10" }),
      "plan",
    );
    expect(argv).toContain("-parallelism=10");
  });
});

describe("buildArgv: init/validate tool variance", () => {
  test("terraform init omits -var/-var-file", () => {
    const argv = buildArgv(
      makeInputs("terraform", { var: ["x=1"], varFile: ["f.tfvars"] }),
      "init",
    );
    expect(argv.some((t) => t.startsWith("-var"))).toBe(false);
  });

  test("tofu init forwards -var/-var-file", () => {
    const argv = buildArgv(
      makeInputs("tofu", { var: ["x=1"], varFile: ["f.tfvars"] }),
      "init",
    );
    expect(argv).toContain("-var=x=1");
    expect(argv).toContain("-var-file=f.tfvars");
  });
});

describe("buildArgv: apply plan-file vs auto-approve", () => {
  test("without auto-approve, consumes the saved tfplan and omits variables", () => {
    const argv = buildArgv(
      makeInputs("terraform", { var: ["x=1"], varFile: ["f.tfvars"] }),
      "apply",
    );
    expect(argv[argv.length - 1]).toBe("tfplan");
    expect(argv).not.toContain("-auto-approve");
    expect(argv.some((t) => t.startsWith("-var"))).toBe(false);
  });

  test("with auto-approve, forwards variables and omits the plan file", () => {
    const argv = buildArgv(
      makeInputs("terraform", { autoApprove: true, var: ["x=1"] }),
      "apply",
    );
    expect(argv).toContain("-auto-approve");
    expect(argv).toContain("-var=x=1");
    expect(argv).not.toContain("tfplan");
  });
});

describe("buildArgv: injection safety", () => {
  test("shell metacharacters in a value stay a single argv element", () => {
    const malicious = '"; rm -rf / #';
    const argv = buildArgv(
      makeInputs("terraform", { var: [`evil=${malicious}`] }),
      "plan",
    );
    expect(argv).toContain(`-var=evil=${malicious}`);
    // the dangerous payload is never split across multiple argv tokens
    expect(argv.filter((t) => t.includes("rm -rf")).length).toBe(1);
  });
});

describe("buildTFEnv", () => {
  test("appends -no-color, preserving any existing TF_CLI_ARGS", () => {
    expect(buildTFEnv(makeInputs("terraform"), {}).TF_CLI_ARGS).toBe(
      "-no-color",
    );
    expect(
      buildTFEnv(makeInputs("terraform"), { TF_CLI_ARGS: "-compact-warnings" })
        .TF_CLI_ARGS,
    ).toBe("-compact-warnings -no-color");
  });

  test("forces automation mode and resolves the workspace", () => {
    const env = buildTFEnv(makeInputs("terraform", { workspace: "dev" }), {});
    expect(env.TF_IN_AUTOMATION).toBe("true");
    expect(env.TF_INPUT).toBe("false");
    expect(env.TF_WORKSPACE).toBe("dev");
    // an existing TF_WORKSPACE in the environment wins over the input
    expect(
      buildTFEnv(makeInputs("terraform", { workspace: "dev" }), {
        TF_WORKSPACE: "prod",
      }).TF_WORKSPACE,
    ).toBe("prod");
  });
});
