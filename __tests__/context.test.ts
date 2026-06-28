import { describe, expect, test } from "bun:test";
import {
  type ActionContext,
  getContext,
  resolvePrNumber,
} from "../src/context";

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    owner: "op5dev",
    repo: "tf-via-pr",
    eventName: "pull_request",
    sha: "abc123",
    refName: "feature",
    headLabel: "op5dev:feature",
    workflowRunHeadBranch: "",
    eventPrNumber: 0,
    checkRunId: 0,
    runId: 0,
    runAttempt: 0,
    serverUrl: "https://github.com",
    triggeringActor: "",
    ...overrides,
  };
}

/** Lookups that record calls so tests can assert which path was taken. */
function spyLookups(byCommit = 0, byHeadRef = 0) {
  const calls: string[] = [];
  return {
    calls,
    lookups: {
      byCommit: async (sha: string) => {
        calls.push(`byCommit:${sha}`);
        return byCommit;
      },
      byHeadRef: async (headRef: string) => {
        calls.push(`byHeadRef:${headRef}`);
        return byHeadRef;
      },
    },
  };
}

describe("getContext", () => {
  test("derives owner/repo, PR number, and check_run_id from env + payload", () => {
    const ctx = getContext(
      {
        GITHUB_REPOSITORY: "op5dev/tf-via-pr",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_SHA: "deadbeef",
        GITHUB_REF_NAME: "feat-x",
        GH_CHECK_RUN_ID: "987654",
        GITHUB_RUN_ID: "42",
      } as NodeJS.ProcessEnv,
      {
        pull_request: {
          number: 123,
          head: { sha: "headsha", ref: "feat-x", label: "op5dev:feat-x" },
        },
      },
    );
    expect(ctx.owner).toBe("op5dev");
    expect(ctx.repo).toBe("tf-via-pr");
    expect(ctx.eventPrNumber).toBe(123);
    expect(ctx.checkRunId).toBe(987654);
    expect(ctx.sha).toBe("headsha"); // pull_request head sha wins over GITHUB_SHA
    expect(ctx.headLabel).toBe("op5dev:feat-x"); // qualified label, not bare branch
    expect(ctx.runId).toBe(42);
  });

  test("prefers workflow_run.head_sha and falls back to a qualified head", () => {
    const ctx = getContext(
      {
        GITHUB_REPOSITORY: "op5dev/tf-via-pr",
        GITHUB_EVENT_NAME: "workflow_run",
        GITHUB_SHA: "merge-sha",
        GITHUB_REF_NAME: "feat-x",
      } as NodeJS.ProcessEnv,
      { workflow_run: { head_sha: "wf-head-sha", head_branch: "feat-x" } },
    );
    expect(ctx.sha).toBe("wf-head-sha"); // workflow_run.head_sha wins over GITHUB_SHA
    expect(ctx.workflowRunHeadBranch).toBe("feat-x");
    expect(ctx.headLabel).toBe("feat-x"); // no PR payload -> branch name fallback
  });

  test("check_run_id defaults to 0 when GH_CHECK_RUN_ID is absent", () => {
    const ctx = getContext(
      { GITHUB_REPOSITORY: "o/r" } as NodeJS.ProcessEnv,
      {},
    );
    expect(ctx.checkRunId).toBe(0);
    expect(ctx.eventPrNumber).toBe(0);
  });
});

describe("resolvePrNumber", () => {
  test("explicit pr-number input wins over everything", async () => {
    const { calls, lookups } = spyLookups();
    const n = await resolvePrNumber(
      makeCtx({ eventName: "push" }),
      555,
      lookups,
    );
    expect(n).toBe(555);
    expect(calls).toEqual([]); // no API lookup
  });

  test("push looks the PR up from the commit", async () => {
    const { calls, lookups } = spyLookups(77);
    const n = await resolvePrNumber(
      makeCtx({ eventName: "push", sha: "s1" }),
      0,
      lookups,
    );
    expect(n).toBe(77);
    expect(calls).toEqual(["byCommit:s1"]);
  });

  test("merge_group parses the PR number from the ref", async () => {
    const { calls, lookups } = spyLookups();
    const ctx = makeCtx({
      eventName: "merge_group",
      refName: "gh-readonly-queue/main/pr-321-abc",
    });
    expect(await resolvePrNumber(ctx, 0, lookups)).toBe(321);
    expect(calls).toEqual([]);
  });

  test("payload PR number is used without an API call", async () => {
    const { calls, lookups } = spyLookups();
    const n = await resolvePrNumber(makeCtx({ eventPrNumber: 99 }), 0, lookups);
    expect(n).toBe(99);
    expect(calls).toEqual([]);
  });

  test("falls back to a head-ref lookup when the payload has no PR number", async () => {
    const { calls, lookups } = spyLookups(0, 12);
    const n = await resolvePrNumber(
      makeCtx({ eventPrNumber: 0, headLabel: "op5dev:feat-y" }),
      0,
      lookups,
    );
    expect(n).toBe(12);
    expect(calls).toEqual(["byHeadRef:op5dev:feat-y"]);
  });

  test("returns 0 (no PR) when nothing resolves", async () => {
    const { lookups } = spyLookups();
    const n = await resolvePrNumber(
      makeCtx({ eventPrNumber: 0, headLabel: "" }),
      0,
      lookups,
    );
    expect(n).toBe(0);
  });
});
