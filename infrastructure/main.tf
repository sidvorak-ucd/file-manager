terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0" # Specify a suitable version constraint
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
  }

  required_version = ">= 1.0" # Specify a suitable Terraform version constraint
}

provider "aws" {
  region = var.aws_region # Use the variable

  # Configure AWS credentials using environment variables,
  # shared credentials file (~/.aws/credentials), or IAM role.
  # It's recommended not to hardcode credentials here.
  # Example using shared credentials file profile:
  # profile = "default"
} 