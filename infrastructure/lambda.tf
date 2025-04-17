data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/" # Use source_dir to zip the entire backend directory
  output_path = "${path.module}/../backend/lambda_package.zip"
}

resource "aws_lambda_function" "api_handler" {
  function_name = "${var.project_name}-api-handler"
  role          = aws_iam_role.lambda_exec_role.arn

  # Point to the deployment package
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  # Specify runtime and handler
  handler = "index.handler" # Assuming entry point is exports.handler in index.js
  runtime = "nodejs18.x"    # Or nodejs20.x, etc., based on backend development choice

  # Set environment variables needed by the function
  environment {
    variables = {
      S3_BUCKET_NAME       = aws_s3_bucket.file_storage.bucket
      DYNAMODB_TABLE_NAME  = aws_dynamodb_table.file_metadata.name
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.user_pool.id # Potentially needed for user context
    }
  }

  # Optional: Configure memory, timeout, etc.
  # memory_size = 256
  # timeout     = 30 

  tags = var.tags
}

# Output Lambda function details
output "lambda_function_name" {
  value = aws_lambda_function.api_handler.function_name
}

output "lambda_function_arn" {
  value = aws_lambda_function.api_handler.arn
}

output "lambda_iam_role_arn" {
  value = aws_iam_role.lambda_exec_role.arn
} 