# Security Policy

> [!TIP]
>
> Pin your GitHub Action to a [commit SHA](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions "Security hardening for GitHub Actions.") to harden your CI/CD **pipeline security** against supply chain attacks.

</br>

Integrating security in your CI/CD pipeline is critical to practicing DevSecOps. This action aims to be secure by default, and it should be complemented with your own review to ensure it meets your (organization's) security requirements.

- Restrict changes to certain environments with [deployment protection rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#deployment-protection-rules "Configuring environment deployment protection rules.").
- Integrate with [OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers "Configuring OpenID Connect in cloud providers.") by passing short-lived credentials as environment variables.

## Supported Versions

| Version | Supported |
| :-----: | :-------: |
|  v13.X  |    Yes    |
| ≤ v12.X |    No     |

## Reporting a Vulnerability

You must never report security related issues, vulnerabilities or bugs including sensitive information to the issue tracker, or elsewhere in public. Instead, sensitive bugs must be sent by email to <security@OP5.dev> or reported via [Security Advisory](https://github.com/op5dev/tf-via-pr/security/advisories/new "Create a new security advisory.").
