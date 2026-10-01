import { describe, expect, test } from "bun:test";
import {
  buildCommentBody,
  type CommentParts,
  parseDiff,
  parseSummary,
  truncate,
} from "../src/comment";

describe("parseDiff", () => {
  test("prefixes each action keyword with its diff symbol", () => {
    const show = [
      "Terraform will perform the following actions:",
      "  # aws_s3_bucket.a will be created",
      "  # aws_instance.b will be destroyed",
      "  # aws_iam_role.c will be updated in-place",
      "  # aws_db.d must be replaced",
      "  # data.aws_ami.e will be read during apply",
      "  # module.f.x will be moved to module.g.x",
      "    some non-comment line",
    ].join("\n");
    const { lines, count } = parseDiff(show);
    expect(lines).toEqual([
      "+ aws_s3_bucket.a will be created",
      "- aws_instance.b will be destroyed",
      "! aws_iam_role.c will be updated in-place",
      "! aws_db.d must be replaced",
      "~ data.aws_ami.e will be read during apply",
      "# module.f.x will be moved to module.g.x",
    ]);
    // the fallback `#` line is not counted as a change
    expect(count).toBe(5);
  });

  test("returns no lines when there is no diff", () => {
    expect(
      parseDiff("No changes. Your infrastructure matches the configuration."),
    ).toEqual({
      lines: [],
      count: 0,
    });
  });
});

describe("parseSummary", () => {
  test("returns the last matching status line", () => {
    const out =
      "Initializing...\nPlan: 1 to add, 0 to change, 0 to destroy.\ntrailing noise";
    expect(parseSummary(out)).toBe(
      "Plan: 1 to add, 0 to change, 0 to destroy.",
    );
  });

  test("matches apply/no-changes/error forms", () => {
    expect(parseSummary("Apply complete! Resources: 1 added.")).toBe(
      "Apply complete! Resources: 1 added.",
    );
    expect(
      parseSummary(
        "No changes. Your infrastructure matches the configuration.",
      ),
    ).toBe("No changes. Your infrastructure matches the configuration.");
    expect(parseSummary("Error: Invalid resource type")).toBe(
      "Error: Invalid resource type",
    );
  });

  test("falls back to 'View output.' when nothing matches", () => {
    expect(parseSummary("just some logs\nmore logs")).toBe("View output.");
  });
});

describe("truncate", () => {
  test("returns the text unchanged when within the limit", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  test("truncates by code point and appends the sentinel", () => {
    expect(truncate("abcdef", 3)).toBe("abc\n…");
  });

  test("counts astral code points as one (never splits a character)", () => {
    // four 😀 (each one code point); limit 2 keeps two, not a broken surrogate
    expect(truncate("😀😀😀😀", 2)).toBe("😀😀\n…");
  });
});

function makeParts(overrides: Partial<CommentParts> = {}): CommentParts {
  return {
    positions: ["P1", "P2", "P3", "P4", "P5", "P6"],
    command: "terraform plan",
    diff: { lines: [], count: 0 },
    console: "Plan: 1 to add",
    diffText: "",
    summary: "Plan: 1 to add, 0 to change, 0 to destroy.",
    syntax: "hcl",
    actorTag: "",
    actor: "octocat",
    timestamp: "2026-06-28T00:00:00Z",
    runUrl: "https://example/run",
    marker: "terraform-7-abc.tfplan",
    expandDiff: false,
    expandSummary: false,
    ...overrides,
  };
}

describe("buildCommentBody", () => {
  test("includes the command block, placeholders, marker, and actor footer", () => {
    const body = buildCommentBody(makeParts({ actorTag: "@" }));
    expect(body).toContain("```fish\nterraform plan\n```");
    expect(body).toContain("<!-- terraform-7-abc.tfplan -->");
    expect(body).toContain(
      "By @octocat at 2026-06-28T00:00:00Z [(view log)](https://example/run).",
    );
    for (const p of ["P1", "P2", "P3", "P4", "P5", "P6"])
      expect(body).toContain(p);
  });

  test("omits the diff block when there are no diff lines", () => {
    expect(buildCommentBody(makeParts())).not.toContain("<summary>Diff of");
  });

  test("renders a collapsible diff block with the right count and noun", () => {
    const body = buildCommentBody(
      makeParts({
        diff: { lines: ["+ a will be created"], count: 1 },
        diffText: "+ a will be created",
        expandDiff: true,
      }),
    );
    expect(body).toContain(
      "<details open><summary>Diff of 1 change.</summary>",
    );
    expect(body).toContain("```diff\n+ a will be created\n```");
  });

  test("expand-summary opens the summary details", () => {
    expect(buildCommentBody(makeParts({ expandSummary: true }))).toContain(
      "<details open><summary>",
    );
  });
});
