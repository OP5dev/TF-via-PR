# Environment-specific configuration for nonprod
locals {
  environment = "nonprod"

  # Environment-specific tags
  environment_tags = {
    Environment = "nonprod"
    CostCenter  = "development"
    DataClass   = "internal"
  }
}
