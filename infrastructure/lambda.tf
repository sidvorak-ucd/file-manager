data "archive_file" "lambda_package" {
  type = "zip"

  # Source the entire backend directory again
  source_dir  = "../backend"
  output_path = "/tmp/lambda_package_built.zip" # Terraform manages this file

  # Temporarily remove excludes to test if auth.js gets included
  # excludes = [
  #   ".git",
  #   ".gitignore",
  #   "README.md",
  #   "node_modules/.bin",
  #   "node_modules/aws-sdk", 
  #   "node_modules/@aws-sdk",
  #   "**/*.test.js",
  #   "**/__mocks__/**",
  #   ".DS_Store"
  # ]
}

# --- Lambda Functions (API triggered) ---

resource "aws_lambda_function" "list_files" {
  filename         = data.archive_file.lambda_package.output_path
  function_name    = "${var.project_name}-list-files"
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "handlers/list-files.handler"
  source_code_hash = data.archive_file.lambda_package.output_base64sha256
  runtime          = "nodejs18.x"

  environment {
    variables = {
      # Only needs DynamoDB table name
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.file_metadata.name
    }
  }
  tags = var.tags
}

resource "aws_lambda_function" "delete_file" {
  filename         = data.archive_file.lambda_package.output_path
  function_name    = "${var.project_name}-delete-file"
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "handlers/delete-file.handler"
  source_code_hash = data.archive_file.lambda_package.output_base64sha256
  runtime          = "nodejs18.x"

  environment {
    variables = {
      # Needs both S3 bucket and DynamoDB table
      S3_BUCKET_NAME      = aws_s3_bucket.file_storage.bucket
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.file_metadata.name
    }
  }
  tags = var.tags
}

resource "aws_lambda_function" "create_upload_url" {
  filename         = data.archive_file.lambda_package.output_path
  function_name    = "${var.project_name}-create-upload-url"
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "handlers/create-upload-url.handler"
  source_code_hash = data.archive_file.lambda_package.output_base64sha256
  runtime          = "nodejs18.x"

  environment {
    variables = {
      S3_BUCKET_NAME          = aws_s3_bucket.file_storage.bucket
      UPLOAD_URL_EXPIRATION = "300" # Optional: customize expiration (seconds)
    }
  }
  tags = var.tags
}

resource "aws_lambda_function" "create_folder" {
  filename         = data.archive_file.lambda_package.output_path
  function_name    = "${var.project_name}-create-folder"
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "handlers/create-folder.handler"
  source_code_hash = data.archive_file.lambda_package.output_base64sha256
  runtime          = "nodejs18.x"

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.file_metadata.name
    }
  }
  tags = var.tags
}

# --- Update create_metadata_lambda in main.tf similarly --- 
# (We'll do that in the next step by editing main.tf again)

# --- Outputs for Lambda Function Names --- 

output "list_files_lambda_function_name" {
  value = aws_lambda_function.list_files.function_name
}

output "delete_file_lambda_function_name" {
  value = aws_lambda_function.delete_file.function_name
}

# Keep role ARN output if useful
output "lambda_iam_role_arn" {
  value = aws_iam_role.lambda_exec_role.arn
}

output "create_upload_url_lambda_function_name" {
  value = aws_lambda_function.create_upload_url.function_name
}

output "create_folder_lambda_function_name" {
  value = aws_lambda_function.create_folder.function_name
}

# --- Get Download URL Lambda ---

resource "aws_lambda_function" "get_download_url" {
  function_name = "${var.project_name}-get-download-url"
  role          = aws_iam_role.lambda_exec_role.arn
  # Update handler path to point to the JS file in the handlers directory
  handler       = "handlers/get-download-url.handler"
  runtime       = "nodejs18.x"
  timeout       = 30

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      BUCKET_NAME          = aws_s3_bucket.file_storage.id
      # Add environment variables needed by the auth utility
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.user_pool.id # Use existing user pool resource
      # AWS_REGION is provided automatically by Lambda runtime, remove explicit setting
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "get_download_url" {
  name              = "/aws/lambda/${aws_lambda_function.get_download_url.function_name}"
  retention_in_days = 14
  tags = var.tags
}

output "lambda_package_hash" {
  description = "The Base64 SHA256 hash of the generated Lambda package."
  value       = data.archive_file.lambda_package.output_base64sha256
}

# --- TODO: Add definitions for other Lambda functions below ---
# - list_files
# - create_folder
# - get_upload_url
# - delete_file 