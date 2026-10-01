# TF-via-PR Test Project - Non-Production Environment - S3 Resource
include "root" {
  path = find_in_parent_folders("root.hcl")
}

# Include environment-specific configuration
include "environment" {
  path = find_in_parent_folders("environment.hcl")
}

locals {
  account_name   = "nonprod"
  account_config = read_terragrunt_config(find_in_parent_folders("accounts.hcl"))
  account        = local.account_config.locals.accounts[local.account_name]
}

# Include centralized AWS provider generator
include "aws_provider" {
  path = find_in_parent_folders("_envcommon/providers/aws.hcl")
}

terraform {
  source = "git::https://github.com/terraform-aws-modules/terraform-aws-s3-bucket.git//?ref=v5.7.0"

  extra_arguments "env" {
    commands = ["init", "plan", "apply", "destroy", "refresh"]
    env_vars = {
      TF_VAR_aws_account_id = local.account.aws_account_id
    }
  }
}

inputs = {
  # Provider/account
  aws_region      = local.account.aws_region
  assume_role_arn = local.account.assume_role_arn

  bucket = "tf-via-pr-test-aws-shared-iacs3-nonprod"
  acl    = "private"

  control_object_ownership = true
  object_ownership         = "ObjectWriter"

  versioning = {
    enabled = true
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  # Lifecycle (shorter for nonprod)
  lifecycle_rule = [
    {
      id      = "nonprod"
      enabled = true

      transition = [
        {
          days          = 30
          storage_class = "STANDARD_IA"
        },
        {
          days          = 90
          storage_class = "GLACIER"
        }
      ]

      expiration = {
        days = 365
      }
    }
  ]

  tags = merge(
    {
      Project     = "tf-via-pr-test"
      Environment = "nonprod"
      ManagedBy   = "Terragrunt"
    },
    try(include.environment.locals.environment_tags, {})
  )
}
