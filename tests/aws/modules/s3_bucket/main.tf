resource "aws_s3_bucket" "this" {
  bucket = "${var.context.env_name}-${var.context.env_type}-${var.context.aws_account_id}--${var.bucket.name_suffix}"
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    default_retention {
      days = var.bucket.retention_days
      mode = "COMPLIANCE"
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}
