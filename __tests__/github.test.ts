import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Fake Octokit driven by `state`, mocked into `@actions/github` at the module
 * boundary. `paginate` resolves by method identity, so the client's real calls
 * exercise the intended endpoints without any network.
 */
interface Comment {
  id: number;
  user: { type: string };
  body: string;
}

const state = {
  calls: [] as string[],
  comments: [] as Comment[],
  associatedPrs: [] as { number: number; head: { ref: string } }[],
  pullsList: [] as { number: number }[],
  artifacts: [] as { id: number }[],
  createId: 0,
  updateId: 0,
  checksThrows: false,
  createThrows: false,
  updateThrows: false,
  deleteThrows: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rest: any = {
  issues: {
    listComments: () => {},
    updateComment: async (p: { comment_id: number }) => {
      state.calls.push(`update:${p.comment_id}`);
      if (state.updateThrows) throw new Error("update failed");
      return { data: { id: state.updateId } };
    },
    createComment: async (p: { issue_number: number }) => {
      state.calls.push(`create:${p.issue_number}`);
      if (state.createThrows) throw new Error("create failed");
      return { data: { id: state.createId } };
    },
    deleteComment: async (p: { comment_id: number }) => {
      state.calls.push(`delete:${p.comment_id}`);
      if (state.deleteThrows) throw new Error("delete failed");
    },
  },
  checks: {
    update: async (p: { check_run_id: number }) => {
      state.calls.push(`checks:${p.check_run_id}`);
      if (state.checksThrows)
        throw new Error("Resource not accessible by integration");
      return { data: { id: 111, html_url: "https://example/check" } };
    },
  },
  actions: {
    listArtifactsForRepo: async () => ({
      data: { artifacts: state.artifacts },
    }),
  },
  pulls: {
    list: async (p: { head: string }) => {
      state.calls.push(`pulls.list:${p.head}`);
      return { data: state.pullsList };
    },
  },
  repos: { listPullRequestsAssociatedWithCommit: () => {} },
};

const fakeOctokit = {
  rest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paginate: async (method: any) => {
    if (method === rest.issues.listComments) return state.comments;
    if (method === rest.repos.listPullRequestsAssociatedWithCommit)
      return state.associatedPrs;
    return [];
  },
};

mock.module("@actions/github", () => ({
  getOctokit: () => fakeOctokit,
  context: { payload: {} },
}));

const { GitHubClient } = await import("../src/github");

function client() {
  return new GitHubClient(
    "token",
    "op5dev",
    "tf-via-pr",
    "https://api.github.com",
  );
}

beforeEach(() => {
  state.calls = [];
  state.comments = [];
  state.associatedPrs = [];
  state.pullsList = [];
  state.artifacts = [];
  state.createId = 0;
  state.updateId = 0;
  state.checksThrows = false;
  state.createThrows = false;
  state.updateThrows = false;
  state.deleteThrows = false;
});

describe("upsertComment", () => {
  const marker = "terraform-7-abc.tfplan";

  test("updates in place when a Bot comment with the marker exists", async () => {
    state.comments = [
      { id: 5, user: { type: "Bot" }, body: `out\n<!-- ${marker} -->` },
    ];
    state.updateId = 5;
    const result = await client().upsertComment({
      prNumber: 7,
      marker,
      body: "new",
      method: "update",
    });
    expect(result).toEqual({ id: 5, action: "updated" });
    expect(state.calls).toEqual(["update:5"]);
  });

  test("creates a new comment when no marker matches", async () => {
    state.comments = [{ id: 9, user: { type: "User" }, body: "unrelated" }];
    state.createId = 42;
    const result = await client().upsertComment({
      prNumber: 7,
      marker,
      body: "new",
      method: "update",
    });
    expect(result).toEqual({ id: 42, action: "created" });
    expect(state.calls).toEqual(["create:7"]);
  });

  test("recreate deletes the old comment then creates a new one", async () => {
    state.comments = [
      { id: 5, user: { type: "Bot" }, body: `<!-- ${marker} -->` },
    ];
    state.createId = 43;
    const result = await client().upsertComment({
      prNumber: 7,
      marker,
      body: "new",
      method: "recreate",
    });
    expect(result).toEqual({ id: 43, action: "recreated" });
    expect(state.calls).toEqual(["delete:5", "create:7"]);
  });

  test("ignores non-Bot comments that happen to contain the marker", async () => {
    state.comments = [
      { id: 1, user: { type: "User" }, body: `<!-- ${marker} -->` },
    ];
    state.createId = 50;
    const result = await client().upsertComment({
      prNumber: 7,
      marker,
      body: "b",
      method: "update",
    });
    expect(result.action).toBe("created");
  });

  test("swallows a create failure and returns { id: 0, action: 'failed' }", async () => {
    state.createThrows = true;
    const result = await client().upsertComment({
      prNumber: 7,
      marker,
      body: "b",
      method: "update",
    });
    expect(result).toEqual({ id: 0, action: "failed" });
  });

  test("swallows an update failure rather than throwing", async () => {
    state.comments = [
      { id: 5, user: { type: "Bot" }, body: `<!-- ${marker} -->` },
    ];
    state.updateThrows = true;
    const result = await client().upsertComment({
      prNumber: 7,
      marker,
      body: "b",
      method: "update",
    });
    expect(result).toEqual({ id: 0, action: "failed" });
  });

  test("recreate still creates when the delete fails", async () => {
    state.comments = [
      { id: 5, user: { type: "Bot" }, body: `<!-- ${marker} -->` },
    ];
    state.deleteThrows = true;
    state.createId = 99;
    const result = await client().upsertComment({
      prNumber: 7,
      marker,
      body: "b",
      method: "recreate",
    });
    expect(result).toEqual({ id: 99, action: "recreated" });
    expect(state.calls).toEqual(["delete:5", "create:7"]);
  });
});

describe("addCheckRunSummary", () => {
  test("patches the check run and returns its id/url", async () => {
    const result = await client().addCheckRunSummary(987, "Plan: 1 to add");
    expect(result).toEqual({ id: 111, htmlUrl: "https://example/check" });
    expect(state.calls).toEqual(["checks:987"]);
  });

  test("is a no-op when checkRunId is 0", async () => {
    const result = await client().addCheckRunSummary(0, "x");
    expect(result).toEqual({});
    expect(state.calls).toEqual([]);
  });

  test("swallows a missing-permission error and returns empty", async () => {
    state.checksThrows = true;
    const result = await client().addCheckRunSummary(987, "x");
    expect(result).toEqual({});
  });
});

describe("lookups", () => {
  test("findArtifactId returns the first id, or null when none", async () => {
    state.artifacts = [{ id: 314 }];
    expect(await client().findArtifactId("name")).toBe(314);
    state.artifacts = [];
    expect(await client().findArtifactId("name")).toBeNull();
  });

  test("findPrByCommit prefers the PR whose head ref matches", async () => {
    state.associatedPrs = [
      { number: 1, head: { ref: "other" } },
      { number: 2, head: { ref: "feature" } },
    ];
    expect(await client().findPrByCommit("sha", "feature", "")).toBe(2);
  });

  test("findPrByCommit falls back to the first associated PR", async () => {
    state.associatedPrs = [{ number: 8, head: { ref: "x" } }];
    expect(await client().findPrByCommit("sha", "nomatch", "")).toBe(8);
  });

  test("findPrByHeadRef returns the first match or 0", async () => {
    state.pullsList = [{ number: 4 }];
    expect(await client().findPrByHeadRef("feature")).toBe(4);
    state.pullsList = [];
    expect(await client().findPrByHeadRef("feature")).toBe(0);
  });
});
