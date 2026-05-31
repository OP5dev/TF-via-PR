import { describe, expect, test } from "bun:test";

/**
 * Phase 0 smoke test: proves the Bun test runner, TypeScript resolution, and
 * the `@actions/*` toolbox resolve under CI. Real module tests arrive with
 * each subsequent phase (args, exec, github, artifact, crypto, comment).
 */
describe("scaffold", () => {
  test("test runner executes TypeScript", () => {
    expect(1 + 1).toBe(2);
  });

  test("@actions/core is importable", async () => {
    const core = await import("@actions/core");
    expect(typeof core.setFailed).toBe("function");
  });
});
