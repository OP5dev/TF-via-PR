variable "context" {
  type    = map(string)
  default = {}
}

variable "bucket" {
  type = object({
    name_suffix    = string
    retention_days = number
  })
  default = {
    name_suffix    = "undefined"
    retention_days = 7
  }
}
