data "aws_ami" "this" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "name"
    values = ["*-${var.instance.ubuntu_version}-amd64-${var.instance.ubuntu_type}-*"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "this" {
  ami           = data.aws_ami.this.id
  instance_type = var.instance.instance_type
  subnet_id     = var.network.subnet_id

  tags = {
    Name = "${var.context.env_name}-${var.context.env_type}--${var.instance.name_suffix}"
  }
}
