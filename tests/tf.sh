#!/bin/bash

terraform -chdir=tests/pass_one init -no-color 2> >(tee pass_one.txt) > >(tee pass_one.txt)
terraform -chdir=tests/fail_format_diff fmt -check=true -diff=true -no-color 2> >(tee fail_format_diff.txt) > >(tee fail_format_diff.txt)
terraform -chdir=tests/fail_data_source_error init -no-color 2> >(tee fail_data_source_error.txt) > >(tee fail_data_source_error.txt)
terraform -chdir=tests/fail_invalid_resource_type init -no-color 2> >(tee fail_invalid_resource_type.txt) > >(tee fail_invalid_resource_type.txt)
