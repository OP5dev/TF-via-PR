context = {
  env_name = "platforms"
  env_type = "stg"

  aws_account_id = "813676077823"
  aws_region     = "us-west-2"
}

ec2_instance = {
  rectangle = {
    name_suffix    = "reggie"
    instance_type  = "t2.micro"
    ubuntu_type    = "server"
    ubuntu_version = "24.04"
  }
}

s3_bucket = {
  teal = {
    name_suffix    = "tyler"
    retention_days = 5
  }
}
