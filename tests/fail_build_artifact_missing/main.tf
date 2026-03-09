# Test case demonstrating build artifact issue (#517)
# This replicates the scenario where data.archive_file generates a zip
# during plan, but the zip is missing during apply because only the
# tfplan file is uploaded/downloaded between workflow runs.
#
# To test this scenario (simulating separate plan/apply jobs):
# 1. Run: terraform init
# 2. Run: terraform plan -out=tfplan
#    (This creates build/bundle.zip via data.archive_file)
# 3. Simulate artifact transfer: rm -rf build/
# 4. Run: terraform apply tfplan
#    (This FAILS because bundle.zip no longer exists)
#
# The new `build-artifacts` input solves this by allowing users to
# specify files/directories to upload alongside the tfplan file.
#
# Example workflow usage with build-artifacts:
#   - uses: op5dev/tf-via-pr@v13
#     with:
#       command: plan
#       build-artifacts: build/bundle.zip
#       # Or for multiple files/directories:
#       # build-artifacts: |
#       #   build/bundle.zip
#       #   dist/

terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

# Archive inline content - creates zip during plan phase
data "archive_file" "bundle" {
  type        = "zip"
  output_path = "${path.module}/build/bundle.zip"

  source {
    content  = "exports.handler = async (event) => { return { statusCode: 200 }; };"
    filename = "index.js"
  }

  source {
    content  = jsonencode({ name = "lambda-function", version = "1.0.0" })
    filename = "package.json"
  }
}

# Simulates deploying the archive (e.g., to S3, Lambda, etc.)
# This will fail during apply if the zip file doesn't exist
resource "null_resource" "deploy" {
  triggers = {
    archive_hash = data.archive_file.bundle.output_base64sha256
  }

  provisioner "local-exec" {
    command = <<-EOT
      if [ -f "${data.archive_file.bundle.output_path}" ]; then
        echo "SUCCESS: Archive found at ${data.archive_file.bundle.output_path}"
        echo "Archive size: $(wc -c < "${data.archive_file.bundle.output_path}") bytes"
        echo "Archive hash: ${data.archive_file.bundle.output_base64sha256}"
      else
        echo "ERROR: Archive missing at ${data.archive_file.bundle.output_path}"
        echo ""
        echo "This failure occurs when:"
        echo "  1. 'terraform plan' runs in one workflow job (creates the zip)"
        echo "  2. Only the tfplan file is transferred to another job"
        echo "  3. 'terraform apply tfplan' runs but the zip is missing"
        echo ""
        echo "Solution: Use 'build-artifacts' input to transfer the zip file"
        exit 1
      fi
    EOT
  }
}

output "archive_path" {
  value       = data.archive_file.bundle.output_path
  description = "Path to the generated archive file"
}

output "archive_size" {
  value       = data.archive_file.bundle.output_size
  description = "Size of the archive in bytes"
}
