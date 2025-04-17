data "archive_file" "lambda_package" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/"
  output_path = "${path.module}/../backend/lambda_package.zip" # Output path for the generated zip

  # Exclude files not needed in the Lambda package
  excludes = [
    ".gitignore",
    "package-lock.json",
    "README.md" # Add any other files/dirs to exclude
  ]
}

# Lambda function for Listing Files (GET /files)
resource "aws_lambda_function" "list_files" {
  function_name = "${var.project_name}-list-files"
  role          = aws_iam_role.lambda_exec_role.arn

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  handler = "handlers/list-files.handler" # Points to list-files.js -> exports.handler
  runtime = "nodejs18.x"

  environment {
    variables = {
      # Only needs DynamoDB table name
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.file_metadata.name
    }
  }
  tags = var.tags
}

# Lambda function for Deleting Files (DELETE /files/{key})
resource "aws_lambda_function" "delete_file" {
  function_name = "${var.project_name}-delete-file"
  role          = aws_iam_role.lambda_exec_role.arn # Using shared role for now

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  handler = "handlers/delete-file.handler" # Points to delete-file.js -> exports.handler
  runtime = "nodejs18.x"

  environment {
    variables = {
      # Needs both S3 bucket and DynamoDB table
      S3_BUCKET_NAME      = aws_s3_bucket.file_storage.bucket
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.file_metadata.name
    }
  }
  tags = var.tags
}

# Lambda function for Creating Upload URL (POST /files/upload-url)
resource "aws_lambda_function" "create_upload_url" {
  function_name = "${var.project_name}-create-upload-url"
  role          = aws_iam_role.lambda_exec_role.arn # Needs s3:PutObject implicitly for signing

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  handler = "handlers/create-upload-url.handler" 
  runtime = "nodejs18.x"

  environment {
    variables = {
      S3_BUCKET_NAME          = aws_s3_bucket.file_storage.bucket
      UPLOAD_URL_EXPIRATION = "300" # Optional: customize expiration (seconds)
    }
  }
  tags = var.tags
}

# Lambda function for Creating Download URL (GET /files/{key}/download-url)
resource "aws_lambda_function" "create_download_url" {
  function_name = "${var.project_name}-create-download-url"
  role          = aws_iam_role.lambda_exec_role.arn # Needs s3:GetObject implicitly for signing

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  handler = "handlers/create-download-url.handler"
  runtime = "nodejs18.x"

  environment {
    variables = {
      S3_BUCKET_NAME            = aws_s3_bucket.file_storage.bucket
      DOWNLOAD_URL_EXPIRATION = "300" # Optional: customize expiration (seconds)
    }
  }
  tags = var.tags
}

# Lambda function for Creating Folders (POST /folders)
resource "aws_lambda_function" "create_folder" {
  function_name = "${var.project_name}-create-folder"
  role          = aws_iam_role.lambda_exec_role.arn # Needs DynamoDB PutItem

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  handler = "handlers/create-folder.handler"
  runtime = "nodejs18.x"

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.file_metadata.name
    }
  }
  tags = var.tags
}

# TODO: Add lambda functions for upload complete?

# --- Outputs --- 

# Remove or update previous outputs as they referred to a single handler
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

output "create_download_url_lambda_function_name" {
  value = aws_lambda_function.create_download_url.function_name
}

output "create_folder_lambda_function_name" {
  value = aws_lambda_function.create_folder.function_name
} 