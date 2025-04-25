terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0" # Use a specific version constraint
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
    archive = {
      source = "hashicorp/archive"
      version = "~> 2.2" # Added archive provider
    }
  }

  required_version = ">= 1.0" # Specify a suitable Terraform version constraint
}

provider "aws" {
  region = var.aws_region # Use the region variable

  # Configure AWS credentials using environment variables,
  # shared credentials file (~/.aws/credentials), or IAM role.
  # It's recommended not to hardcode credentials here.
  # Example using shared credentials file profile:
  # profile = "default"
}

variable "region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1" # Or your preferred region
}

variable "resource_prefix" {
  description = "A prefix to add to all resource names to ensure uniqueness and identify the application"
  type        = string
  default     = "s3-file-manager" # Or your preferred prefix
}

# Data source to get the current region (used in api_gateway.tf)
data "aws_region" "current" {}

# --- Existing Lambda Definitions --- 

# IAM Role and Policy for Metadata Lambda
resource "aws_iam_role" "create_metadata_lambda_role" {
  name = "${var.resource_prefix}-create-metadata-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "create_metadata_lambda_policy" {
  name        = "${var.resource_prefix}-create-metadata-lambda-policy"
  description = "Policy for the Create Metadata Lambda function"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Action   = "dynamodb:PutItem"
        Effect   = "Allow"
        Resource = aws_dynamodb_table.file_metadata.arn
      }
      # Add s3:GetObject if needing to read file metadata/tags in the future
    ]
  })
}

resource "aws_iam_role_policy_attachment" "create_metadata_lambda_attach" {
  role       = aws_iam_role.create_metadata_lambda_role.name
  policy_arn = aws_iam_policy.create_metadata_lambda_policy.arn
}

# Lambda Function for Creating Metadata
resource "aws_lambda_function" "create_metadata_lambda" {
  filename         = data.archive_file.lambda_package.output_path # Use shared archive data source
  function_name    = "${var.resource_prefix}-create-metadata-handler"
  role             = aws_iam_role.create_metadata_lambda_role.arn
  handler          = "handlers/create-metadata.handler" 
  source_code_hash = data.archive_file.lambda_package.output_base64sha256 # Use shared archive data source
  runtime          = "nodejs18.x"

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.file_metadata.name
    }
  }
}

# --- Existing S3 Bucket --- 

# Add S3 event notification to trigger the metadata Lambda
resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.file_storage.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.create_metadata_lambda.arn
    events              = ["s3:ObjectCreated:Put"]
    # Optional: Filter by prefix if all user uploads go under a common path like "users/"
    # filter_prefix       = "users/"
  }

  depends_on = [aws_lambda_function.create_metadata_lambda, aws_lambda_permission.allow_s3_invoke_metadata] # Ensure lambda and permission exist
}

# Permission for S3 to invoke the Metadata Lambda
resource "aws_lambda_permission" "allow_s3_invoke_metadata" {
  statement_id  = "AllowS3InvokeMetadataLambda"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_metadata_lambda.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.file_storage.arn
  # Optional: Add source_account if needed
}


# --- Existing API Gateway Resources --- 

# Note: No API Gateway resources needed for the S3-triggered metadata Lambda 