[![Terraform Compatible](https://img.shields.io/badge/Terraform-Compatible-844FBA?logo=terraform&logoColor=white)](https://github.com/hashicorp/setup-terraform "Terraform Compatible.")
[![OpenTofu Compatible](https://img.shields.io/badge/OpenTofu-Compatible-FFDA18?logo=opentofu&logoColor=white)](https://github.com/opentofu/setup-opentofu "OpenTofu Compatible.")
*
[![GitHub license](https://img.shields.io/github/license/op5dev/tf-via-pr?logo=apache&label=License)](LICENSE "Apache License 2.0.")
[![GitHub release tag](https://img.shields.io/github/v/release/op5dev/tf-via-pr?logo=semanticrelease&label=Release)](https://github.com/op5dev/tf-via-pr/releases "View all releases.")
*
[![GitHub repository stargazers](https://img.shields.io/github/stars/op5dev/tf-via-pr)](https://github.com/op5dev/tf-via-pr "Become a stargazer.")

# Terraform/OpenTofu via Pull Request (TF-via-PR)

<table>
  <tr>
    <th>
      <h3>What does it do?</h3>
    </th>
    <th>
      <h3>Who is it for?</h3>
    </th>
  </tr>
  <tr>
    <td>
      <ul>
        <li>Plan and apply changes with CLI arguments and <strong>encrypted plan file</strong> to avoid configuration drift.</li>
        <li>Outline diff within up-to-date <strong>PR comment</strong> and matrix-friendly workflow summary, complete with log.</li>
      </ul>
    </td>
    <td>
      <ul>
        <li>DevOps and Platform engineers wanting to empower their teams to <strong>self-service</strong> scalably.</li>
        <li>Maintainers looking to <strong>secure</strong> their pipeline without the overhead of containers or VMs.</li>
      </ul>
    </td>
  </tr>
</table>

</br>

### View: [Usage Examples](#usage-examples) · [Inputs](#inputs) · [Outputs](#outputs) · [Security](#security) · [Changelog](#changelog) · [License](#license)

[![PR comment of plan output with "Diff of changes" section expanded.](/.github/assets/comment.png)](https://raw.githubusercontent.com/op5dev/tf-via-pr/refs/heads/main/.github/assets/comment.png "View full-size image.")

</br>

## Usage Examples

### How to get started?

```yaml
on:
  pull_request:
  push:
    branches: [main]

jobs:
  provision:
    runs-on: ubuntu-latest

    permissions:
      actions: read        # Required to identify workflow run.
      checks: write        # Required to add status summary.
      contents: read       # Required to checkout repository.
      pull-requests: write # Required to add PR comment.

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_wrapper: false

      # Run plan by default, or apply on merge.
      - uses: op5dev/tf-via-pr@v13
        with:
          working-directory: path/to/directory
          command: ${{ github.event_name == 'push' && 'apply' || 'plan' }}
          arg-lock: ${{ github.event_name == 'push' }}
          arg-backend-config: env/dev.tfbackend
          arg-var-file: env/dev.tfvars
          arg-workspace: dev-use1
          plan-encrypt: ${{ secrets.PASSPHRASE }}
```

> [!TIP]
>
> - All supported arguments (e.g., `-backend-config`, `-destroy`, `-parallelism`, etc.) are [listed below](#arguments).
> - Environment variables can be passed in for cloud platform authentication (e.g., [configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials "Configuring AWS credentials for use in GitHub Actions.") for short-lived credentials via OIDC).
> - Recommend setting `terraform_wrapper`/`tofu_wrapper` to `false` in order to output the [detailed exit code](https://developer.hashicorp.com/terraform/cli/commands/plan#detailed-exitcode) for better error handling.

</br>

### Where to find more examples?

The following workflows showcase common use cases, while a comprehensive list of inputs is [documented](#inputs) below.

<table>
  <tr>
    <td>
      <h4><a href="/.github/examples/pr_push_auth.yaml">#1 example ⤴</a></h4>
      <p>Runs on <code>pull_request</code> (plan) and <code>push</code> (apply) events with Terraform, AWS <strong>authentication</strong> and <strong>cache</strong>.</p>
      </br>
    </td>
    <td>
      <h4><a href="/.github/examples/pr_merge_matrix.yaml">#2 example ⤴</a></h4>
      <p>Runs on <code>pull_request</code> (plan) and <code>merge_group</code> (apply) events with OpenTofu in <strong>matrix</strong> strategy.</p>
      </br>
    </td>
  </tr>
  <tr>
    <td>
      <h4><a href="/.github/examples/pr_push_lint.yaml">#3 example ⤴</a></h4>
      <p>Runs on <code>pull_request</code> (plan) and <code>push</code> (apply) events with <strong>fmt/validate checks</strong> and TFLint.</p>
      </br>
    </td>
    <td>
      <h4><a href="/.github/examples/pr_push_stages.yaml">#4 example ⤴</a></h4>
      <p>Runs on <code>pull_request</code> (plan) and <code>push</code> (apply) events with <strong>conditional jobs</strong> based on plan file.</p>
      </br>
    </td>
  </tr>
  <tr>
    <td>
      <h4><a href="/.github/examples/pr_manual_label.yaml">#5 example ⤴</a></h4>
      <p>Runs on <code>labeled</code> and <code>workflow_dispatch</code> <strong>manual</strong> events on GitHub Enterprise (GHE) <strong>self-hosted runner</strong>.</p>
      </br>
    </td>
    <td>
      <h4><a href="/.github/examples/schedule_refresh.yaml">#6 example ⤴</a></h4>
      <p>Runs on <code>schedule</code> <strong>cron</strong> event with <code>-refresh-only</code> to open an issue on <strong>configuration drift</strong>.</p>
      </br>
    </td>
  </tr>
</table>

</br>

### Are there online references?

1. Medium - [Enhance Terraform/Tofu PR Automation with GitHub Action](https://medium.com/@rishavd/enhance-terraform-tofu-automation-with-github-action-1a775c8b6b61?source=friends_link&sk=645cb1f862d36fcc6f10e4fcffa44641)
1. Medium - [Secure cloud provisioning pipeline with GitHub automation](https://storiesfromtheherd.com/secure-cloud-provisioning-pipeline-with-github-automation-1767b7ec0277?source=friends_link&sk=89f9975aaf838be87e2b0ac2d1e6d4e9)
1. Terraform Weekly - [Issue #207](https://www.weekly.tf/p/issue-207-security-with-trivy-and-github-actions-tflint-aws-codebuild-and-self-hosted-gha-runners#opensource-projects)
1. Awesome OpenTofu - [CI Tools](https://awesome-opentofu.com/#ci)
1. LinkedIn - [GitOps with Terraform](https://www.linkedin.com/posts/chris3ware_gitops-terraform-activity-7259857653781217280-ozl2?utm_source=share&utm_medium=member_desktop&rcm=ACoAABUNaiIBf1vPir8Ef4ONnj2ohruezX5pFPo)

</br>

### How does encryption work?

Before the workflow uploads the plan file as an artifact, it can be encrypted-at-rest with a passphrase using `plan-encrypt` input to prevent exposure of sensitive data (e.g., `${{ secrets.PASSPHRASE }}`). This is done with [OpenSSL](https://docs.openssl.org/master/man1/openssl-enc/ "OpenSSL encryption documentation.")'s symmetric stream counter mode ([256 bit AES in CTR](https://docs.openssl.org/3.3/man1/openssl-enc/#supported-ciphers:~:text=192/256%20bit-,AES%20in%20CTR%20mode,-aes%2D%5B128%7C192)) encryption with salt and pbkdf2.

In order to decrypt the plan file locally, use the following commands after downloading the artifact (adding a whitespace before `openssl` to prevent recording the command in shell history):

```fish
unzip <tfplan.zip>
openssl enc -d -aes-256-ctr -pbkdf2 -salt \
  -in   tfplan.encrypted \
  -out  tfplan.decrypted \
  -pass pass:"<passphrase>"
<tf.tool> show tfplan.decrypted
```

</br>

## Inputs

All supported CLI argument inputs are [listed below](#arguments) with accompanying options, while workflow configuration inputs are listed here.

### Configuration

| Type     | Name                | Description                                                                                                                               |
| -------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CLI      | `working-directory` | Specify the working directory of TF code, alias of `arg-chdir`.</br>Example: `path/to/directory`                                          |
| CLI      | `command`           | Command to run between: `plan` or `apply`.<sup>1</sup></br>Example: `plan`                                                                |
| CLI      | `tool`              | Provisioning tool to use between: `terraform` or `tofu`.</br>Default: `terraform`                                                         |
| CLI      | `plan-file`         | Supply existing plan file path instead of the auto-generated one.</br>Example: `path/to/file.tfplan`                                      |
| Check    | `format`            | Check format of TF code.</br>Default: `false`                                                                                             |
| Check    | `validate`          | Check validation of TF code.</br>Default: `false`                                                                                         |
| Check    | `plan-parity`       | Replace plan file if it matches a newly-generated one to prevent stale apply.<sup>2</sup></br>Default: `false`                            |
| Security | `plan-encrypt`      | Encrypt plan file artifact with the given input.<sup>3</sup></br>Example: `${{ secrets.PASSPHRASE }}`                                     |
| Security | `preserve-plan`     | Preserve plan file "tfplan" in the given working directory after workflow execution.</br>Default: `false`                                 |
| Security | `upload-plan`       | Upload plan file as GitHub workflow artifact.</br>Default: `true`                                                                         |
| Security | `retention-days`    | Duration after which plan file artifact will expire in days.</br>Example: `90`                                                            |
| Security | `token`             | Specify a GitHub token.</br>Default: `${{ github.token }}`                                                                                |
| UI       | `expand-diff`       | Expand the collapsible diff section.</br>Default: `false`                                                                                 |
| UI       | `expand-summary`    | Expand the collapsible summary section.</br>Default: `false`                                                                              |
| UI       | `comment-pr`        | Add a PR comment: `always`, `on-change`, or `never`.<sup>4</sup></br>Default: `always`                                                    |
| UI       | `comment-method`    | PR comment by: `update` existing comment or `recreate` and delete previous one.<sup>5</sup></br>Default: `update`                         |
| UI       | `tag-actor`         | Tag the workflow triggering actor: `always`, `on-change`, or `never`.<sup>4</sup></br>Default: `always`                                   |
| UI       | `hide-args`         | Hide comma-separated list of CLI arguments from the command input.<sup>6</sup></br>Default: `detailed-exitcode,parallelism,lock,out,var=` |
| UI       | `show-args`         | Show comma-separated list of CLI arguments in the command input.<sup>6</sup></br>Default: `workspace`                                     |

</br>

1. Both `command: plan` and `command: apply` include: `init`, `fmt` (with `format: true`), `validate` (with `validate: true`), and `workspace` (with `arg-workspace`) commands rolled into it automatically.</br>
    To separately run checks and/or generate outputs only, `command: init` can be used.</br></br>
1. Originally intended for `merge_group` event trigger, `plan-parity: true` input helps to prevent stale apply within a series of workflow runs when merging multiple PRs.</br></br>
1. The secret string input for `plan-encrypt` can be of any length, as long as it's consistent between encryption (plan) and decryption (apply).</br></br>
1. The `on-change` option is true when the exit code of the last TF command is non-zero (ensure `terraform_wrapper`/`tofu_wrapper` is set to `false`).</br></br>
1. The default behavior of `comment-method` is to update the existing PR comment with the latest plan/apply output, making it easy to track changes over time through the comment's revision history.</br></br>
  [![PR comment revision history comparing plan and apply outputs.](/.github/assets/revisions.png)](https://raw.githubusercontent.com/op5dev/tf-via-pr/refs/heads/main/.github/assets/revisions.png "View full-size image.")</br></br>
1. It can be desirable to hide certain arguments from the last run command input to prevent exposure in the PR comment (e.g., sensitive `arg-var` values). Conversely, it can be desirable to show other arguments even if they are not in last run command input (e.g., `arg-workspace` or `arg-backend-config` selection).

</br>

### Arguments

> [!NOTE]
>
> - Arguments are passed to the appropriate TF command(s) automatically, whether that's `fmt`, `init`, `validate`, `plan`, or `apply`.</br>
> - For repeated arguments like `arg-var`, `arg-var-file`, `arg-backend-config`, `arg-replace` and `arg-target`, use commas to separate multiple values (e.g., `arg-var: key1=value1,key2=value2`).

</br>

Applicable to respective "plan" and "apply" `command` inputs ("init" included).

| Name                      | CLI Argument                             |
| ------------------------- | ---------------------------------------- |
| `arg-auto-approve`        | `-auto-approve`                          |
| `arg-backend-config`      | `-backend-config`                        |
| `arg-backend`             | `-backend`                               |
| `arg-backup`              | `-backup`                                |
| `arg-chdir`               | `-chdir`</br>Alias: `working-directory`  |
| `arg-compact-warnings`    | `-compact-warnings`                      |
| `arg-concise`             | `-concise`                               |
| `arg-destroy`             | `-destroy`                               |
| `arg-detailed-exitcode`   | `-detailed-exitcode`</br>Default: `true` |
| `arg-force-copy`          | `-force-copy`                            |
| `arg-from-module`         | `-from-module`                           |
| `arg-generate-config-out` | `-generate-config-out`                   |
| `arg-get`                 | `-get`                                   |
| `arg-lock-timeout`        | `-lock-timeout`                          |
| `arg-lock`                | `-lock`                                  |
| `arg-lockfile`            | `-lockfile`                              |
| `arg-migrate-state`       | `-migrate-state`                         |
| `arg-parallelism`         | `-parallelism`                           |
| `arg-plugin-dir`          | `-plugin-dir`                            |
| `arg-reconfigure`         | `-reconfigure`                           |
| `arg-refresh-only`        | `-refresh-only`                          |
| `arg-refresh`             | `-refresh`                               |
| `arg-replace`             | `-replace`                               |
| `arg-state-out`           | `-state-out`                             |
| `arg-state`               | `-state`                                 |
| `arg-target`              | `-target`                                |
| `arg-upgrade`             | `-upgrade`                               |
| `arg-var-file`            | `-var-file`                              |
| `arg-var`                 | `-var`                                   |
| `arg-workspace`           | `-workspace`</br>Alias: `TF_WORKSPACE`   |

</br>

Applicable only when `format: true`.

| Name            | CLI Argument                     |
| --------------- | -------------------------------- |
| `arg-check`     | `-check`</br>Default: `true`     |
| `arg-diff`      | `-diff`</br>Default: `true`      |
| `arg-list`      | `-list`                          |
| `arg-recursive` | `-recursive`</br>Default: `true` |
| `arg-write`     | `-write`                         |

</br>

Applicable only when `validate: true`.

| Name                 | CLI Argument      |
| -------------------- | ----------------- |
| `arg-no-tests`       | `-no-tests`       |
| `arg-test-directory` | `-test-directory` |

</br>

## Outputs

| Type     | Name           | Description                                   |
| -------- | -------------- | --------------------------------------------- |
| Artifact | `plan-id`      | ID of the plan file artifact.                 |
| Artifact | `plan-url`     | URL of the plan file artifact.                |
| CLI      | `command`      | Input of the last TF command.                 |
| CLI      | `diff`         | Diff of changes, if present (truncated).      |
| CLI      | `exitcode`     | Exit code of the last TF command.             |
| CLI      | `result`       | Result of the last TF command (truncated).    |
| CLI      | `summary`      | Summary of the last TF command.               |
| Workflow | `check-id`     | ID of the check run.                          |
| Workflow | `comment-body` | Body of the PR comment.                       |
| Workflow | `comment-id`   | ID of the PR comment.                         |
| Workflow | `job-id`       | ID of the workflow job.                       |
| Workflow | `run-url`      | URL of the workflow run.                      |
| Workflow | `identifier`   | Unique name of the workflow run and artifact. |

</br>

## Security

View [security policy and reporting instructions](SECURITY.md). Integrating security in your CI/CD pipeline is critical to practicing DevSecOps. This action aims to be secure by default, and it should be complemented with your own review to ensure it meets your (organization's) security requirements.

- Restrict changes to certain environments with [deployment protection rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#deployment-protection-rules "Configuring environment deployment protection rules.").
- Integrate with [OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers "Configuring OpenID Connect in cloud providers.") by passing short-lived credentials as environment variables.

> [!TIP]
>
> Pin your GitHub Action to a [commit SHA](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions "Security hardening for GitHub Actions.") to harden your CI/CD **pipeline security** against supply chain attacks.

</br>

## Changelog

View [all notable changes](https://github.com/op5dev/tf-via-pr/releases "Releases.") to this project in [Keep a Changelog](https://keepachangelog.com "Keep a Changelog.") format, which adheres to [Semantic Versioning](https://semver.org "Semantic Versioning.").

> [!TIP]
>
> All forms of **contribution are very welcome** and deeply appreciated for fostering open-source projects.
>
> - [Create a PR](https://github.com/op5dev/tf-via-pr/pulls "Create a pull request.") to contribute changes you'd like to see.
> - [Raise an issue](https://github.com/op5dev/tf-via-pr/issues "Raise an issue.") to propose changes or report unexpected behavior.
> - [Open a discussion](https://github.com/op5dev/tf-via-pr/discussions "Open a discussion.") to discuss broader topics or questions.
> - [Become a stargazer](https://github.com/op5dev/tf-via-pr/stargazers "Become a stargazer.") if you find this project useful.

</br>

### To-Do

- Handling of inputs which contain space(s) (e.g., `working-directory: path to/directory`).
- Handling of comma-separated inputs which contain comma(s) (e.g., `arg-var: token=1,2,3`)—use `TF_CLI_ARGS` [workaround](https://developer.hashicorp.com/terraform/cli/config/environment-variables#tf_cli_args-and-tf_cli_args_name).

</br>

## License

- This project is licensed under the permissive [Apache License 2.0](LICENSE "Apache License 2.0.").
- All works herein are my own, shared of my own volition, and [contributors](https://github.com/op5dev/tf-via-pr/graphs/contributors "Contributors.").
- Copyright 2016-present [Rishav Dhar](https://github.com/rdhar "Rishav Dhar's GitHub profile.") — All wrongs reserved.
