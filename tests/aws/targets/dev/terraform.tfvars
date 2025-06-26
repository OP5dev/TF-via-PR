context = {
  env_name = "platforms"
  env_type = "dev"

  aws_account_id = "813676077823"
  aws_region     = "us-west-1"
}

ec2_instance = {
  triangle = {
    name_suffix    = "tom"
    instance_type  = "t2.micro"
    ubuntu_type    = "server"
    ubuntu_version = "24.04"
  }
}

s3_bucket = {
  orange = {
    name_suffix    = "olly"
    retention_days = 3
  }
  yam = {
    name_suffix    = "ollie"
    retention_days = 3
  }
}
