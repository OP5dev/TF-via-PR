# Plan: Implement ACME Challenge LB Rules for Bestnet

We will add OpenStack Load Balancer resources to `nomadclient.tf` to handle ACME challenges, creating a dedicated pool and L7 rules to redirect `.well-known/acme-challenge/` traffic. A new variable will be introduced to handle the port difference between environments (8081 default, 8080 for prod-bestnet).

## Proposed Changes

### 1. Modify `nomadclient.tf`
- Add `variable "nomadclient_acme_port"` with a default value of `8081`.
- Add the following resources (adapted from the ticket snippet):
  - `openstack_lb_pool_v2.nomadclient_challenge_acme`
  - `openstack_lb_member_v2.nomadclient_challenge_acme` (using `var.nomadclient_acme_port`)
  - `openstack_lb_monitor_v2.acme_healthmonitor`
  - `openstack_lb_l7policy_v2.acme_challenge_policy`
  - `openstack_lb_l7rule_v2.acme_challenge_rule`

### 2. Modify `environments/prod-bestnet.tfvars`
- Add `nomadclient_acme_port = 8080` to override the default for the production environment, aligning with the ticket's note.

## Rationale
- The ticket explicitly provides the Terraform configuration needed to support the new Vault-based Let's Encrypt integration.
- The comment "in prod_bestnet protocol_port = 8080" indicates a deviation from the snippet's 8081 for the production environment. Using a variable allows us to apply the standard configuration while respecting the environment-specific requirement.
- Existing `nomadclient` resources in `nomadclient.tf` confirm the resource names match the snippet (e.g., `openstack_compute_instance_v2.nomadclient`).

## Verification
- Verify that `nomadclient.tf` successfully validates.
- Ensure `prod-bestnet.tfvars` correctly overrides the port.
