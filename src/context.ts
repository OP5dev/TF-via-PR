import * as github from "@actions/github";

/**
 * Workflow context normalization (Phase 3 of the TypeScript migration).
 *
 * Replaces the composite action's `identifier`/`post` bash that read scattered
 * `github.*` expressions and `$GITHUB_*` variables. Two notable simplifications
 * over the bash:
 *
 * - **Job identification** no longer polls the jobs API with exponential
 *   backoff. GitHub now exposes `job.check_run_id` in the workflow `job`
 *   context, so the run that wants to update its own check run reads it directly.
 *   The composite `action.yml` passes it through as `GH_CHECK_RUN_ID`
 *   (`${{ job.check_run_id }}`) when this module is wired in (Phase 5).
 * - **PR-number resolution** is a pure decision over the event payload, with a
 *   single injected async lookup for the cases that genuinely need the API.
 */

/** Normalized view of the workflow run, sourced from env + the event payload. */
export interface ActionContext {
  owner: string;
  repo: string;
  eventName: string;
  /** Head commit SHA. */
  sha: string;
  /** `GITHUB_REF_NAME`. */
  refName: string;
  /**
   * Qualified head for the `pulls` list `head` filter: `pull_request.head.label`
   * ("owner:branch") when available, else the branch name. The qualified form is
   * required for fork PRs, where a bare branch can match the wrong PR or none.
   */
  headLabel: string;
  /** `workflow_run.head_branch`, when triggered by `workflow_run`. */
  workflowRunHeadBranch: string;
  /** PR number from the event payload (`number`/`issue.number`), or 0. */
  eventPrNumber: number;
  /** `job.check_run_id`, passed via `GH_CHECK_RUN_ID`; 0 when unavailable. */
  checkRunId: number;
  runId: number;
  runAttempt: number;
  serverUrl: string;
  triggeringActor: string;
}

function intEnv(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Build the {@link ActionContext} from the environment and the parsed event
 * payload. Both are injectable for testing; they default to the live runner
 * environment and `@actions/github`'s parsed `context.payload`.
 */
export function getContext(
  env: NodeJS.ProcessEnv = process.env,
  payload: typeof github.context.payload = github.context.payload,
): ActionContext {
  const [owner = "", repo = ""] = (env.GITHUB_REPOSITORY ?? "").split("/");
  const workflowRun = (
    payload as { workflow_run?: { head_branch?: string; head_sha?: string } }
  ).workflow_run;
  const eventPrNumber =
    intEnv(payload.pull_request?.number?.toString()) ||
    intEnv(payload.issue?.number?.toString()) ||
    intEnv((payload as { number?: number }).number?.toString());

  return {
    owner,
    repo,
    eventName: env.GITHUB_EVENT_NAME ?? "",
    sha:
      payload.pull_request?.head?.sha ??
      workflowRun?.head_sha ??
      env.GITHUB_SHA ??
      "",
    refName: env.GITHUB_REF_NAME ?? "",
    headLabel:
      payload.pull_request?.head?.label ??
      env.GITHUB_REF_NAME ??
      env.GITHUB_HEAD_REF ??
      env.GITHUB_REF ??
      "",
    workflowRunHeadBranch: workflowRun?.head_branch ?? "",
    eventPrNumber,
    checkRunId: intEnv(env.GH_CHECK_RUN_ID),
    runId: intEnv(env.GITHUB_RUN_ID),
    runAttempt: intEnv(env.GITHUB_RUN_ATTEMPT),
    serverUrl: env.GITHUB_SERVER_URL ?? "https://github.com",
    triggeringActor: env.GITHUB_TRIGGERING_ACTOR ?? "",
  };
}

/** Events for which the PR is found from the commit rather than the payload. */
const COMMIT_LOOKUP_EVENTS = new Set([
  "push",
  "repository_dispatch",
  "workflow_call",
  "workflow_dispatch",
  "workflow_run",
]);

/**
 * Resolve the PR number across every supported trigger, matching the composite
 * action's precedence:
 *
 * 1. an explicit `pr-number` input wins;
 * 2. commit-driven events look the PR up from the head commit;
 * 3. `merge_group` parses it from the ref (`…/pr-<n>-…`);
 * 4. otherwise use the event payload, falling back to a head-ref lookup;
 * 5. `0` means "no associated PR" (skip commenting).
 *
 * The two API-backed lookups are injected so this stays a pure, fully testable
 * decision.
 */
export async function resolvePrNumber(
  ctx: ActionContext,
  prNumberInput: number,
  lookups: {
    byCommit: (
      sha: string,
      refName: string,
      workflowRunHeadBranch: string,
    ) => Promise<number>;
    byHeadRef: (headRef: string) => Promise<number>;
  },
): Promise<number> {
  if (prNumberInput > 0) return prNumberInput;

  if (COMMIT_LOOKUP_EVENTS.has(ctx.eventName)) {
    return lookups.byCommit(ctx.sha, ctx.refName, ctx.workflowRunHeadBranch);
  }

  if (ctx.eventName === "merge_group") {
    const match = ctx.refName.match(/pr-(\d+)-/);
    return match?.[1] ? Number(match[1]) : 0;
  }

  if (ctx.eventPrNumber > 0) return ctx.eventPrNumber;
  if (ctx.headLabel !== "") return lookups.byHeadRef(ctx.headLabel);
  return 0;
}
