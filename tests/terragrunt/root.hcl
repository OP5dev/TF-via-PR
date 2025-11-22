# Root terragrunt.hcl - Common configuration for everything
# This file contains the base configuration that all child modules inherit

# Include common configuration values
locals {
  common      = read_terragrunt_config(find_in_parent_folders("_envcommon/common.hcl"))
  environment = read_terragrunt_config(find_in_parent_folders("environment.hcl")).locals

  # Backend configuration - consistent naming pattern
  backend_config = {
    bucket       = "${local.common.locals.state_bucket}-${local.common.locals.bucket_suffixes[local.environment.environment]}"
    key          = "${path_relative_to_include()}/terraform.tfstate"
    region       = local.common.locals.aws_region
    encrypt      = true
    use_lockfile = true # S3 native state locking (no DynamoDB required)
  }
}

# Backend configuration - consistent across all environments
remote_state {
  backend = "s3"
  config  = local.backend_config
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
}

# Global variables that can be overridden by child modules
inputs = {
  aws_region   = get_env("TF_VAR_aws_region", "us-west-1")
  environment  = get_env("TF_VAR_environment", "dev")
  project_name = get_env("TF_VAR_project_name", "tf-via-pr-test")

  # Assume role configuration for cross-account access
  assume_role_arn = get_env("TF_VAR_assume_role_arn", "")

  # Common tags
  common_tags = merge(
    local.environment.environment_tags,
    {
      Environment = get_env("TF_VAR_environment", "dev")
      Project     = get_env("TF_VAR_project_name", "tf-via-pr-test")
      ManagedBy   = "Terragrunt"
      Owner       = "DevOps"
    }
  )
}
