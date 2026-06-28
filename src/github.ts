import * as core from "@actions/core";
import * as github from "@actions/github";

/**
 * GitHub API operations via Octokit (Phase 3 of the TypeScript migration).
 *
 * Replaces every `gh api` / `curl` call in the composite action — PR comment
 * upsert, check-run summary, artifact lookup, and PR-number lookups — with a
 * typed domain client. No retry/backoff loop is bundled: job identification now
 * comes from `job.check_run_id` (see `context.ts`), and transient-failure
 * resilience, if wanted, is better handled by Octokit's retry plugin than a
 * hand-rolled loop (flagged for the maintainer).
 */

export type CommentMethod = "update" | "recreate";

export interface UpsertCommentArgs {
  prNumber: number;
  /** Unique identifier embedded in the body as `<!-- <marker> -->`. */
  marker: string;
  body: string;
  method: CommentMethod;
}

export interface UpsertResult {
  /** The comment id, or 0 when the operation failed (best-effort). */
  id: number;
  action: "created" | "updated" | "recreated" | "failed";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Thin domain wrapper over Octokit, scoped to one repository. `getOctokit`
 * derives the base URL from `GITHUB_API_URL`, so github.com, `*.ghe.com`
 * (including EU data residency), and self-hosted GHES all work with no extra
 * configuration; it is passed explicitly here to make that guarantee obvious.
 */
export class GitHubClient {
  private readonly octokit: ReturnType<typeof github.getOctokit>;

  constructor(
    token: string,
    private readonly owner: string,
    private readonly repo: string,
    apiUrl: string = process.env.GITHUB_API_URL ?? "https://api.github.com",
  ) {
    this.octokit = github.getOctokit(token, { baseUrl: apiUrl });
  }

  /**
   * Create or update the action's PR comment, identified by its hidden marker.
   * Finds the most recent Bot-authored comment whose body contains the marker;
   * `update` edits it in place, `recreate` deletes and re-posts, and a missing
   * comment is created. Returns the comment id and which action was taken.
   *
   * Best-effort, matching the composite action's `|| true` on comment ops: a
   * transient API failure is warned and swallowed (returning `{ id: 0, action:
   * "failed" }`) rather than failing the whole run. A failed delete in the
   * `recreate` path still proceeds to create.
   */
  async upsertComment(args: UpsertCommentArgs): Promise<UpsertResult> {
    try {
      const existing = await this.findMarkerComment(args.prNumber, args.marker);

      if (existing !== null && args.method === "update") {
        const { data } = await this.octokit.rest.issues.updateComment({
          owner: this.owner,
          repo: this.repo,
          comment_id: existing,
          body: args.body,
        });
        return { id: data.id, action: "updated" };
      }

      if (existing !== null && args.method === "recreate") {
        try {
          await this.deleteComment(existing);
        } catch (error) {
          core.warning(
            `Unable to delete previous PR comment ${existing}: ${errorMessage(error)}`,
          );
        }
      }

      const { data } = await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: args.prNumber,
        body: args.body,
      });
      return {
        id: data.id,
        action: existing !== null ? "recreated" : "created",
      };
    } catch (error) {
      core.warning(`Unable to upsert PR comment: ${errorMessage(error)}`);
      return { id: 0, action: "failed" };
    }
  }

  /** Id of the latest Bot comment containing `marker`, or null if none. */
  async findMarkerComment(
    prNumber: number,
    marker: string,
  ): Promise<number | null> {
    const comments = await this.octokit.paginate(
      this.octokit.rest.issues.listComments,
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        per_page: 100,
      },
    );
    const match = comments
      .filter((c) => c.user?.type === "Bot" && (c.body ?? "").includes(marker))
      .at(-1);
    return match?.id ?? null;
  }

  async deleteComment(commentId: number): Promise<void> {
    await this.octokit.rest.issues.deleteComment({
      owner: this.owner,
      repo: this.repo,
      comment_id: commentId,
    });
  }

  /**
   * Patch a check run's title/summary. Tolerant of a missing `checks: write`
   * permission (the v13.3.2 edge case): on failure it warns and returns empty
   * rather than failing the action. A `checkRunId` of 0 is a no-op.
   */
  async addCheckRunSummary(
    checkRunId: number,
    summary: string,
  ): Promise<{ id?: number; htmlUrl?: string }> {
    if (checkRunId <= 0) return {};
    try {
      const { data } = await this.octokit.rest.checks.update({
        owner: this.owner,
        repo: this.repo,
        check_run_id: checkRunId,
        output: { title: summary, summary },
      });
      // html_url is typed `string | null`; omit it rather than store null
      // (exactOptionalPropertyTypes forbids an explicit undefined here).
      const result: { id?: number; htmlUrl?: string } = { id: data.id };
      if (data.html_url) result.htmlUrl = data.html_url;
      return result;
    } catch (error) {
      core.warning(
        `Unable to update check run ${checkRunId} (is 'checks: write' granted?): ${errorMessage(error)}`,
      );
      return {};
    }
  }

  /**
   * The most recent artifact with the exact `name`, as `{ id, workflowRunId }`,
   * or null. The source run id is needed to download an artifact uploaded by a
   * different run (the plan run vs. the apply run) via `@actions/artifact`'s
   * `findBy`. Repo-wide name lookup mirrors the composite action's
   * `actions/artifacts?name=` query.
   */
  async findArtifact(
    name: string,
  ): Promise<{ id: number; workflowRunId: number } | null> {
    const { data } = await this.octokit.rest.actions.listArtifactsForRepo({
      owner: this.owner,
      repo: this.repo,
      name,
      per_page: 1,
    });
    const artifact = data.artifacts[0];
    if (artifact === undefined) return null;
    // A cross-run download is unusable without the source run id; treat an
    // artifact missing it as not found (it should always be present in practice)
    // rather than returning a 0 that fails opaquely at download time.
    const workflowRunId = artifact.workflow_run?.id;
    if (!workflowRunId) return null;
    return { id: artifact.id, workflowRunId };
  }

  /** Id of the most recent artifact with the exact `name`, or null. */
  async findArtifactId(name: string): Promise<number | null> {
    return (await this.findArtifact(name))?.id ?? null;
  }

  /**
   * PR number associated with a commit. Prefers the PR whose head ref matches
   * `refName` or the `workflow_run` head branch; otherwise the first associated
   * PR; otherwise 0. Mirrors the composite action's `commits/{sha}/pulls` query.
   */
  async findPrByCommit(
    sha: string,
    refName: string,
    workflowRunHeadBranch: string,
  ): Promise<number> {
    if (sha === "") return 0;
    const prs = await this.octokit.paginate(
      this.octokit.rest.repos.listPullRequestsAssociatedWithCommit,
      {
        owner: this.owner,
        repo: this.repo,
        commit_sha: sha,
        per_page: 100,
      },
    );
    const matched = prs.find(
      (pr) => pr.head.ref === refName || pr.head.ref === workflowRunHeadBranch,
    );
    return matched?.number ?? prs[0]?.number ?? 0;
  }

  /**
   * PR number for an open PR with the given qualified head, or 0. `headLabel`
   * must be the `owner:branch` form (GitHub's `head` filter is qualified);
   * passing a bare branch can match the wrong PR or none for fork PRs.
   */
  async findPrByHeadRef(headLabel: string): Promise<number> {
    if (headLabel === "") return 0;
    const { data } = await this.octokit.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      head: headLabel,
      state: "open",
      per_page: 1,
    });
    return data[0]?.number ?? 0;
  }
}
