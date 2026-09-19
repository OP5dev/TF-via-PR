#!/bin/bash

terraform -chdir=tests/pass_one init -no-color 2> >(tee pass_one.txt) > >(tee pass_one.txt)
terraform -chdir=tests/fail_format_diff fmt -check=true -diff=true -no-color 2> >(tee fail_format_diff.txt) > >(tee fail_format_diff.txt)
terraform -chdir=tests/fail_data_source_error init -no-color 2> >(tee fail_data_source_error.txt) > >(tee fail_data_source_error.txt)
terraform -chdir=tests/fail_invalid_resource_type init -no-color 2> >(tee fail_invalid_resource_type.txt) > >(tee fail_invalid_resource_type.txt)

# Test case for build artifact issue (#517)
# This demonstrates the scenario where interim build artifacts are missing during apply
echo "=== Testing build artifact scenario (issue #517) ==="
terraform -chdir=tests/fail_build_artifact_missing init -no-color
terraform -chdir=tests/fail_build_artifact_missing plan -out=tfplan -no-color
# Simulate artifact transfer (only tfplan, not the build directory)
rm -rf tests/fail_build_artifact_missing/build/
# This apply should fail because bundle.zip is missing
terraform -chdir=tests/fail_build_artifact_missing apply tfplan -no-color 2> >(tee fail_build_artifact_missing.txt) > >(tee fail_build_artifact_missing.txt) || echo "Expected failure: build artifact missing"
# Cleanup
rm -f tests/fail_build_artifact_missing/tfplan
