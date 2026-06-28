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
  id: number;
  action: "created" | "updated" | "recreated";
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
   */
  async upsertComment(args: UpsertCommentArgs): Promise<UpsertResult> {
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
      await this.deleteComment(existing);
    }

    const { data } = await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: args.prNumber,
      body: args.body,
    });
    return { id: data.id, action: existing !== null ? "recreated" : "created" };
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
        `Unable to update check run ${checkRunId} (is 'checks: write' granted?): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {};
    }
  }

  /** Id of the most recent artifact with the exact `name`, or null. */
  async findArtifactId(name: string): Promise<number | null> {
    const { data } = await this.octokit.rest.actions.listArtifactsForRepo({
      owner: this.owner,
      repo: this.repo,
      name,
      per_page: 1,
    });
    return data.artifacts[0]?.id ?? null;
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

  /** PR number for an open PR with the given head ref, or 0. */
  async findPrByHeadRef(headRef: string): Promise<number> {
    if (headRef === "") return 0;
    const { data } = await this.octokit.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      head: headRef,
      state: "open",
      per_page: 1,
    });
    return data[0]?.number ?? 0;
  }
}
