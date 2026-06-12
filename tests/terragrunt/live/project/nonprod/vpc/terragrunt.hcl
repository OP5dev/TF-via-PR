# TF-via-PR Test Project - Non-Production Environment - VPC Resource
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
  source = "git::https://github.com/terraform-aws-modules/terraform-aws-vpc.git//?ref=v6.2.0"

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

  name = "tf-via-pr-test-vpc-nonprod"
  cidr = "10.0.0.0/16"

  azs             = ["${local.account.aws_region}b", "${local.account.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  enable_vpn_gateway = false

  enable_dns_hostnames = true
  enable_dns_support   = true

  # Enable flow logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
  flow_log_max_aggregation_interval    = 60

  # VPC Flow Logs destination
  flow_log_destination_type = "cloud-watch-log-group"

  public_subnet_tags = {
    Type = "public"
  }

  private_subnet_tags = {
    Type = "private"
  }

  tags = merge(
    {
      Project     = "tf-via-pr-test"
      Environment = "nonprod"
      ManagedBy   = "Terragrunt"
      Component   = "vpc"
    },
    try(include.environment.locals.environment_tags, {})
  )
}
