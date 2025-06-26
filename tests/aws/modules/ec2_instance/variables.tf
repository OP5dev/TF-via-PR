variable "context" {
  type    = map(string)
  default = {}
}

variable "instance" {
  type = object({
    instance_type  = string
    name_suffix    = string
    ubuntu_type    = string
    ubuntu_version = string
  })
  default = {
    instance_type  = "t2.micro"
    name_suffix    = "undefined"
    ubuntu_type    = "minimal"
    ubuntu_version = "24.04"
  }
}

variable "network" {
  type    = any
  default = {}
}
