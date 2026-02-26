# Terragrunt Example

This directory contains a simple Terragrunt configuration that creates a local file.

## Usage

After creating "terragrunt.hcl", run the following commands:

```fish
terragrunt plan --log-format bare
terragrunt apply
```

For variable input, run the following:

```fish
terragrunt apply -auto-approve -var content='Hello, Terragrunt!'
```
