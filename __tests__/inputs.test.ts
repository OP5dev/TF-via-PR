import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getInputs } from "../src/inputs";

/**
 * `@actions/core.getInput(name)` reads `process.env['INPUT_' + name
 * .replace(/ /g, '_').toUpperCase()]`, so setting those env vars exercises the
 * real reader with no mocking. Each test starts from a clean slate.
 */
function setInputs(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    process.env[`INPUT_${name.toUpperCase()}`] = value;
  }
}

function clearInputs(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INPUT_")) delete process.env[key];
  }
}

beforeEach(clearInputs);
afterEach(clearInputs);

describe("getInputs defaults", () => {
  test("applies action.yml defaults when nothing is set", () => {
    const inputs = getInputs();
    expect(inputs.tool).toBe("terraform");
    expect(inputs.command).toBe("");
    expect(inputs.uploadPlan).toBe(true);
    expect(inputs.commentMethod).toBe("update");
    expect(inputs.commentPr).toBe("always");
    expect(inputs.tagActor).toBe("always");
    // booleans whose action.yml default is "true"
    expect(inputs.args.check).toBe(true);
    expect(inputs.args.detailedExitcode).toBe(true);
    expect(inputs.args.diff).toBe(true);
    expect(inputs.args.recursive).toBe(true);
    // booleans whose default is unset/false
    expect(inputs.args.autoApprove).toBe(false);
    expect(inputs.args.destroy).toBe(false);
    // comment placeholders fall back to their HTML-marker defaults
    expect(inputs.commentPos[0]).toBe("<!-- comment-pos-1 -->");
    expect(inputs.commentPos[5]).toBe("<!-- comment-pos-6 -->");
  });
});

describe("getInputs parsing", () => {
  test("booleans use case-insensitive 'true' semantics, not getBooleanInput", () => {
    setInputs({
      "arg-auto-approve": "TRUE",
      "arg-check": "False",
      "arg-destroy": "yes",
    });
    const inputs = getInputs();
    expect(inputs.args.autoApprove).toBe(true); // "TRUE" -> true
    expect(inputs.args.check).toBe(false); // explicit "False" overrides the true default
    expect(inputs.args.destroy).toBe(false); // anything not "true" is false (no throw)
  });

  test("CSV inputs split on comma and trim, dropping empties", () => {
    setInputs({
      "arg-backend-config": "one.tfvars, two.tfvars ,",
      "arg-target": "a,b,c",
    });
    const inputs = getInputs();
    expect(inputs.args.backendConfig).toEqual(["one.tfvars", "two.tfvars"]);
    expect(inputs.args.target).toEqual(["a", "b", "c"]);
  });

  test("arg-chdir falls back to working-directory", () => {
    setInputs({ "working-directory": "stacks/dev" });
    expect(getInputs().args.chdir).toBe("stacks/dev");
    setInputs({ "arg-chdir": "explicit", "working-directory": "stacks/dev" });
    expect(getInputs().args.chdir).toBe("explicit"); // arg-chdir wins
  });
});

describe("getInputs validation", () => {
  test("rejects an invalid tool", () => {
    setInputs({ tool: "pulumi" });
    expect(() => getInputs()).toThrow(/Invalid 'tool'/);
  });

  test("rejects an invalid command", () => {
    setInputs({ command: "destroy" });
    expect(() => getInputs()).toThrow(/Invalid 'command'/);
  });

  test("normalises deprecated comment-pr 'on-change' to 'on-diff'", () => {
    setInputs({ "comment-pr": "on-change" });
    expect(getInputs().commentPr).toBe("on-diff");
  });

  test("maps tag-actor aliases (true -> always, on-change -> on-diff)", () => {
    setInputs({ "tag-actor": "true" });
    expect(getInputs().tagActor).toBe("always");
    setInputs({ "tag-actor": "on-change" });
    expect(getInputs().tagActor).toBe("on-diff");
  });
});

describe("getInputs: unset vs. explicit empty", () => {
  test("hide-args/show-args fall back to their action.yml defaults when unset", () => {
    const inputs = getInputs();
    expect(inputs.hideArgs).toEqual([
      "detailed-exitcode",
      "parallelism",
      "lock",
      "out",
      "var=",
    ]);
    expect(inputs.showArgs).toEqual(["workspace"]);
  });

  test("an explicit empty value overrides a non-empty default (not treated as unset)", () => {
    // Boolean: explicit "" must be false, not the `true` default.
    setInputs({ "arg-check": "" });
    expect(getInputs().args.check).toBe(false);
    // List: explicit "" must clear the default, not fall back to it.
    setInputs({ "arg-check": "", "hide-args": "" });
    expect(getInputs().hideArgs).toEqual([]);
  });

  test("an empty enum input coalesces to its default rather than throwing", () => {
    setInputs({ "comment-pr": "", "comment-method": "", tool: "" });
    const inputs = getInputs();
    expect(inputs.commentPr).toBe("always");
    expect(inputs.commentMethod).toBe("update");
    expect(inputs.tool).toBe("terraform");
  });
});
