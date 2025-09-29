# Terragrunt Multi-Level Test Examples

This directory contains comprehensive examples for testing Terragrunt `plan` and `apply` operations on multi-level infrastructure deployments across nonprod and prod AWS accounts.

## Architecture Overview

The test structure demonstrates a multi-level Terragrunt deployment with:

- **Root Configuration**: Backend and common settings (root.hcl)
- **Common Configurations**: Shared settings and provider configs (_envcommon/)
- **Account Management**: Account-specific configurations (accounts.hcl)
- **Environment Level**: Environment-specific configurations (nonprod, prod)
- **Component Level**: Individual infrastructure components (VPC, EC2, S3) with provider config

## Directory Structure

```
tests/terragrunt/
├── root.hcl                          # Root configuration (includes common)
├── accounts.hcl                      # Account configuration for all environments
├── _envcommon/                       # Common configurations
│   ├── common.hcl                    # Shared configuration, tags, and backend settings
│   └── providers/
│       └── aws.hcl                   # AWS provider configuration
├── live/                             # Live infrastructure configurations
│   └── project/                      # Project-specific infrastructure
│       ├── nonprod/
│       │   ├── environment.hcl       # Non-prod environment config
│       │   ├── vpc/
│       │   │   └── terragrunt.hcl    # VPC component
│       │   ├── ec2/
│       │   │   └── terragrunt.hcl    # EC2 instances component
│       │   └── s3/
│       │       └── terragrunt.hcl    # S3 buckets component
│       └── prod/
│           ├── environment.hcl       # Production environment config
│           ├── vpc/
│           │   └── terragrunt.hcl    # VPC component (placeholder)
│           ├── ec2/
│           │   └── (placeholder)     # EC2 instances component (placeholder)
│           └── s3/
│               └── terragrunt.hcl    # S3 buckets component
├── .pre-commit-config.yaml           # Pre-commit hooks configuration
├── .gitignore                        # Git ignore patterns
├── verify-config.sh                  # Configuration verification script
└── README.md                         # This file
```

## Prerequisites

1. **Terragrunt**: Install Terragrunt (v0.48+ recommended, v0.54+ also supported)
2. **AWS CLI**: Configured with access to `tcx-aws-ice-test` account
3. **Terraform**: v1.5+ (will be downloaded automatically by Terragrunt)

## Quick Verification

Run the verification script to ensure your configuration is correct:

```bash
cd tests/terragrunt
./verify-config.sh
```

## AWS Account Configuration

The examples use multiple AWS accounts for different environments:

### Non-Production Environment
- **Account ID**: 155524221786
- **Region**: us-west-1
- **S3 Backend**: terragrunt-state-tf-via-pr-test-nonprod
- **DynamoDB**: terragrunt-locks-tf-via-pr-test-nonprod (for state locking)

### Production Environment  
- **Account ID**: 813676077823
- **Region**: us-west-1
- **S3 Backend**: terragrunt-state-tf-via-pr-test-prod
- **DynamoDB**: terragrunt-locks-tf-via-pr-test-prod (for state locking)

## Usage Examples

### 1. Initialize and Plan VPC Component

```bash
cd tests/terragrunt/live/project/nonprod/vpc

# Initialize Terragrunt
terragrunt init

# Plan the VPC deployment
terragrunt plan

# Apply the VPC deployment
terragrunt apply
```

### 2. Deploy Complete Non-Production Environment

```bash
cd tests/terragrunt/live/project/nonprod

# Deploy VPC first (dependency)
cd vpc
terragrunt apply

# Deploy EC2 instances (depends on VPC)
cd ../ec2
terragrunt apply

# Deploy S3 buckets
cd ../s3
terragrunt apply
```

### 3. Deploy Production Environment

```bash
cd tests/terragrunt/live/project/prod

# Deploy S3 buckets (currently the only active component)
cd s3
terragrunt apply

# Note: VPC and EC2 components are placeholders in prod environment
```

### 4. Run Plan on All Components

```bash
# From the root terragrunt directory
cd tests/terragrunt

# Plan all components in non-prod environment
terragrunt run-all plan --terragrunt-working-dir live/project/nonprod

# Plan all components in prod environment  
terragrunt run-all plan --terragrunt-working-dir live/project/prod
```

### 5. Apply All Components

```bash
# Apply all components in non-prod environment
terragrunt run-all apply --terragrunt-working-dir live/project/nonprod

# Apply all components in prod environment
terragrunt run-all apply --terragrunt-working-dir live/project/prod
```

### 6. GitHub Actions Integration

This project includes a GitHub Actions workflow (`.github/workflows/terragrunt-live-all.yml`) that can:

- Automatically discover all Terragrunt configurations
- Run `plan`, `apply`, or `destroy` across all components
- Support matrix builds for parallel execution
- Use OIDC for secure AWS authentication

**Note**: The workflow is located at the repository root level (`.github/workflows/`), not in the terragrunt test directory.

Trigger the workflow manually with:
- **Command**: Choose from `plan`, `apply`, or `destroy`

## Module Sources

The examples use official Terraform AWS modules:

- **VPC**: [terraform-aws-modules/vpc/aws](https://github.com/terraform-aws-modules/terraform-aws-vpc)
- **EC2**: [terraform-aws-modules/ec2-instance/aws](https://github.com/terraform-aws-modules/terraform-aws-ec2-instance)
- **S3**: [terraform-aws-modules/s3-bucket/aws](https://github.com/terraform-aws-modules/terraform-aws-s3-bucket)

## Key Features Demonstrated

1. **Official Modules**: All components use maintained terraform-aws-modules
2. **Provider Management**: Centralized AWS provider configuration in `_envcommon/providers/aws.hcl`
3. **Dependency Management**: EC2 instances depend on VPC resources with mock outputs for planning
4. **Environment Separation**: Different configurations and accounts for nonprod and prod
5. **State Management**: Environment-specific S3 backends with DynamoDB locking
6. **Account Management**: Centralized account configuration with assume role support
7. **Tagging Strategy**: Consistent tagging across all resources with environment-specific tags
8. **CI/CD Integration**: GitHub Actions workflow for automated Terragrunt operations
9. **Security**: Encrypted state files, secure S3 backends, proper IAM role assumptions

## Testing Commands

### Configuration Verification

First, verify your configuration is correct:

```bash
cd tests/terragrunt
./verify-config.sh
```

### Basic Testing

```bash
# Test plan on non-prod VPC
cd tests/terragrunt/live/project/nonprod/vpc
terragrunt plan

# Test plan on non-prod EC2
cd ../ec2
terragrunt plan

# Test plan on non-prod S3
cd ../s3
terragrunt plan
```

### Advanced Testing

```bash
# Test dependency resolution (EC2 depends on VPC)
cd tests/terragrunt/live/project/nonprod/ec2
terragrunt plan

# Test environment-specific variables and account configuration
cd ../../prod/s3
terragrunt plan

# Test root configuration inheritance (root.hcl)
cd ../../nonprod/vpc
terragrunt plan

# Test configuration validation
terragrunt validate-inputs
```

## Cleanup

To destroy all resources:

```bash
# Destroy in reverse dependency order for non-prod
cd tests/terragrunt/live/project/nonprod
cd s3 && terragrunt destroy
cd ../ec2 && terragrunt destroy
cd ../vpc && terragrunt destroy

# Destroy in reverse dependency order for prod
cd ../../prod
cd s3 && terragrunt destroy
# Note: VPC and EC2 components are placeholders in prod

# Or use run-all for each environment (destroys in correct order)
cd tests/terragrunt
terragrunt run-all destroy --terragrunt-working-dir live/project/nonprod
terragrunt run-all destroy --terragrunt-working-dir live/project/prod

# Or use GitHub Actions workflow with 'destroy' command
```

## Troubleshooting

### Common Issues

1. **State Lock**: If operations fail, check DynamoDB for stuck locks
2. **Permissions**: Ensure AWS credentials have necessary permissions
3. **Dependencies**: Always deploy VPC before EC2 instances
4. **Module Versions**: Check for module version compatibility

### Debug Commands

```bash
# Show Terragrunt configuration
terragrunt show-config

# Show dependency graph
terragrunt graph-dependencies

# Validate configuration
terragrunt validate-inputs
```

## Security Notes

- All resources are tagged appropriately
- S3 buckets have encryption and lifecycle policies
- EC2 instances use security groups with minimal required access
- VPC resources are properly isolated
- State files are encrypted and stored securely

## Cost Considerations

- Non-prod environment uses cost-effective instance types
- Prod environment has production-grade configurations
- S3 lifecycle policies help manage storage costs
- All resources are tagged for cost tracking and environment identification
- Separate accounts provide cost isolation and better financial management

## Configuration Files Overview

### Core Configuration Files

- **`root.hcl`**: Root Terragrunt configuration with backend settings and global inputs
- **`accounts.hcl`**: Centralized account configuration for all environments
- **`_envcommon/common.hcl`**: Shared configuration values and backend settings
- **`_envcommon/providers/aws.hcl`**: Centralized AWS provider configuration
- **`environment.hcl`**: Environment-specific configurations and tags

### Component Files

Each component (`vpc`, `ec2`, `s3`) has its own `terragrunt.hcl` file that:
- Includes the root configuration
- Includes environment-specific configuration  
- Includes the AWS provider configuration
- Defines dependencies (e.g., EC2 depends on VPC)
- Specifies the Terraform module source
- Provides component-specific inputs 