# TF-via-PR Test Project - Non-Production Environment - EC2 Resource
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

# Dependency on VPC
dependency "vpc" {
  config_path = find_in_parent_folders("vpc")
  
  mock_outputs = {
    vpc_id         = "vpc-mock"
    private_subnets = ["subnet-mock1", "subnet-mock2"]
    public_subnets  = ["subnet-mock3", "subnet-mock4"]
  }
  
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "validate-inputs"]
}

terraform {
  source = "git::https://github.com/terraform-aws-modules/terraform-aws-ec2-instance.git//?ref=v6.1.1"

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

  name = "tf-via-pr-test-ec2-nonprod"

  instance_count = 1

  # ami                   = "ami-0c02fb55956c7d316" # Amazon Linux 2 AMI (us-west-1)
  instance_type         = "t2.micro"

  monitoring            = true
  subnet_id             = dependency.vpc.outputs.private_subnets[0]
  
  # Let the EC2 module create its own security group
  create_security_group = true

  # User data script
  user_data_base64 = base64encode(<<-EOF
    #!/bin/bash
    yum update -y
    yum install -y httpd
    systemctl start httpd
    systemctl enable httpd
    echo "<h1>TF-via-PR Test - Non-Production Environment</h1>" > /var/www/html/index.html
  EOF
  )

  # Root volume
  root_block_device = {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  # Volume tags
  volume_tags = merge({
    Name = "tf-via-pr-test-ec2-root-nonprod"
  }, try(include.environment.locals.environment_tags, {}))

  tags = merge(
    {
      Project     = "tf-via-pr-test"
      Environment = "nonprod"
      ManagedBy   = "Terragrunt"
      Component   = "ec2"
    },
    try(include.environment.locals.environment_tags, {})
  )
}
