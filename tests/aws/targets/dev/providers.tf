terraform {
  required_version = ">= 1.5, < 2.0"

  backend "s3" {
    bucket       = "tf-via-pr-813676077823"
    key          = "dev-tfstate.json"
    region       = "us-west-1"
    use_lockfile = "true"
  }

  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

provider "aws" {
  region = var.context.aws_region

  default_tags {
    tags = var.context
  }
}
