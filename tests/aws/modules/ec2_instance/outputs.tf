output "ami_id" {
  value = data.aws_ami.this.id
}

output "instance_id" {
  value = aws_instance.this.id
}
