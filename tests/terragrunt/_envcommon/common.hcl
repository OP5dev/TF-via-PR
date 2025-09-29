# _envcommon/common.hcl
# Centralized configuration values for all environments

locals {
  # Backend configuration
  state_bucket = "terragrunt-state-tf-via-pr-test"
  aws_region   = "us-west-1"

  # Environment-specific bucket suffixes
  bucket_suffixes = {
    nonprod    = "nonprod"
  }
}
