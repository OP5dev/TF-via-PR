module "vpc" {
  source = "../../modules/vpc_default" # github.com/op5dev/tf-via-pr//tests/aws/modules/vpc_default?depth=1&ref=v13.5.0

  context = var.context
}

module "ec2_instance" {
  source   = "../../modules/ec2_instance" # github.com/op5dev/tf-via-pr//tests/aws/modules/ec2_instance?depth=1&ref=v13.5.0
  for_each = var.ec2_instance

  context  = var.context
  instance = var.ec2_instance[each.key]
  network  = module.vpc
}

module "s3_bucket" {
  source   = "../../modules/s3_bucket" # github.com/op5dev/tf-via-pr//tests/aws/modules/s3_bucket?depth=1&ref=v13.5.0
  for_each = var.s3_bucket

  context = var.context
  bucket  = var.s3_bucket[each.key]
}
