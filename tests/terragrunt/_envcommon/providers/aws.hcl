# _envcommon/providers/aws.hcl
# Centralized AWS provider generation per selected account

locals {
  # Select account by env var or default. Leaf stacks can override by defining local.account_name before including this file.
  account_name_default = get_env("TG_ACCOUNT_NAME", get_env("ACCOUNT_NAME", "nonprod"))
  account_name         = local.account_name_default

  account_config = read_terragrunt_config(find_in_parent_folders("accounts.hcl"))
  account        = local.account_config.locals.accounts[local.account_name]
}

# Ensure remote_state bucket account id is set for this run
terraform {
  extra_arguments "env" {
    commands = ["init", "plan", "apply", "destroy", "refresh"]
    env_vars = {
      TF_VAR_aws_account_id = local.account.aws_account_id
    }
  }
}

# Generate the provider for the selected account
generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF

provider "aws" {
  region = "${local.account.aws_region}"

  default_tags {
    tags = {
      ManagedBy = "Terragrunt"
      Account   = "${local.account.name}"
    }
  }
}
EOF
}
