resource "aws_default_vpc" "this" {
  tags = {
    Name = "${var.context.env_name}-${var.context.env_type}--default"
  }
}

resource "aws_default_subnet" "this" {
  availability_zone = "${var.context.aws_region}b"

  tags = {
    Name = "${var.context.env_name}-${var.context.env_type}--default"
  }
}
