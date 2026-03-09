# Central account configuration for all environments
# Live stacks will read this file and select an account by name

locals {
  accounts = {
    nonprod = {
      name            = "nonprod"
      aws_account_id  = "155524221786"
      aws_region      = "us-west-1"
      assume_role_arn = "xxxxxxx"
    }
  }
}
