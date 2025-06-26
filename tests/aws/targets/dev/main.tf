module "vpc" {
  source = "../../modules/vpc_default"

  context = var.context
}

module "ec2_instance" {
  source   = "../../modules/ec2_instance"
  for_each = var.ec2_instance

  context  = var.context
  instance = var.ec2_instance[each.key]
  network  = module.vpc
}

module "s3_bucket" {
  source   = "../../modules/s3_bucket"
  for_each = var.s3_bucket

  context = var.context
  bucket  = var.s3_bucket[each.key]
}
