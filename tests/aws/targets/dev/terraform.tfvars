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
  square = {
    name_suffix    = "squid"
    instance_type  = "t2.micro"
    ubuntu_type    = "server"
    ubuntu_version = "24.04"
  }
}

s3_bucket = {
  purple = {
    name_suffix    = "badger"
    retention_days = 3
  }
}
