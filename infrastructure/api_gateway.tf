# API Gateway v2 (HTTP API)
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${var.project_name}-http-api"
  protocol_type = "HTTP"
  description   = "API Gateway for S3 File Manager"

  cors_configuration {
    allow_origins = ["*"] # Be more specific in production, e.g., your frontend domain
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"]
    allow_headers = ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key", "X-Amz-Security-Token"]
    max_age       = 300
  }

  tags = var.tags
}

# Cognito Authorizer for JWT validation
resource "aws_apigatewayv2_authorizer" "cognito_auth" {
  api_id           = aws_apigatewayv2_api.http_api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"] # Standard place for JWT Bearer token
  name             = "${var.project_name}-cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.app_client.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.user_pool.id}"
  }
}

# --- Integrations --- 

# Lambda Integration for List Files
resource "aws_apigatewayv2_integration" "list_files_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.list_files.invoke_arn
  payload_format_version = "2.0"
}

# Lambda Integration for Delete File
resource "aws_apigatewayv2_integration" "delete_file_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.delete_file.invoke_arn
  payload_format_version = "2.0"
}

# Lambda Integration for Create Upload URL
resource "aws_apigatewayv2_integration" "create_upload_url_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.create_upload_url.invoke_arn
  payload_format_version = "2.0"
}

# Lambda Integration for Create Download URL
resource "aws_apigatewayv2_integration" "create_download_url_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.create_download_url.invoke_arn
  payload_format_version = "2.0"
}

# Lambda Integration for Create Folder
resource "aws_apigatewayv2_integration" "create_folder_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.create_folder.invoke_arn
  payload_format_version = "2.0"
}

# TODO: Add integrations for other Lambda functions

# --- Routes --- 

# Route for GET /files -> list_files Lambda
resource "aws_apigatewayv2_route" "get_files_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /files"

  target = "integrations/${aws_apigatewayv2_integration.list_files_integration.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_auth.id
}

# Route for DELETE /files/{fileKey} -> delete_file Lambda
# Note: {fileKey} acts as a path parameter name
resource "aws_apigatewayv2_route" "delete_file_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "DELETE /files/{fileKey}"

  target = "integrations/${aws_apigatewayv2_integration.delete_file_integration.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_auth.id
}

# Route for POST /files/upload-url -> create_upload_url Lambda
resource "aws_apigatewayv2_route" "create_upload_url_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /files/upload-url"

  target = "integrations/${aws_apigatewayv2_integration.create_upload_url_integration.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_auth.id
}

# Route for GET /files/{fileKey}/download-url -> create_download_url Lambda
resource "aws_apigatewayv2_route" "create_download_url_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /files/{fileKey}/download-url"

  target = "integrations/${aws_apigatewayv2_integration.create_download_url_integration.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_auth.id
}

# Route for POST /folders -> create_folder Lambda
resource "aws_apigatewayv2_route" "create_folder_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /folders"

  target = "integrations/${aws_apigatewayv2_integration.create_folder_integration.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_auth.id
}

# TODO: Add routes for other methods/paths

# OPTIONS route for CORS preflight (does not need authorization)
resource "aws_apigatewayv2_route" "options_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "OPTIONS /{proxy+}"

  # Integration for OPTIONS is not strictly required if CORS is handled by the API Gateway config itself
  # If more complex CORS logic is needed, point this to a specific integration or mock integration.
  # For simplicity with basic CORS config, we can omit the target.
  # target = "integrations/mock" # Example if a mock target was defined
}

# --- Stage --- 

# Default Stage with Auto-Deploy
resource "aws_apigatewayv2_stage" "default_stage" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default" # Special stage name for automatic deployment
  auto_deploy = true

  # Optional: Configure throttling
  # default_route_settings {
  #   throttling_burst_limit = 500
  #   throttling_rate_limit  = 1000
  # }

  # Optional: Access logging (requires CloudWatch Log Group)
  # access_log_settings {
  #   destination_arn = aws_cloudwatch_log_group.api_gw_logs.arn
  #   format          = "..." 
  # }

  tags = var.tags
}

# --- Lambda Permissions --- 

# Permission for API Gateway to invoke the list_files Lambda function
resource "aws_lambda_permission" "invoke_list_files_permission" {
  statement_id  = "AllowAPIGatewayInvokeListFiles"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_files.function_name
  principal     = "apigateway.amazonaws.com"

  # Source ARN for the specific route/method if possible, or broader API scope
  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/GET/files"
}

# Permission for API Gateway to invoke the delete_file Lambda function
resource "aws_lambda_permission" "invoke_delete_file_permission" {
  statement_id  = "AllowAPIGatewayInvokeDeleteFile"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_file.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/DELETE/files/*"
}

# Permission for API Gateway to invoke the create_upload_url Lambda function
resource "aws_lambda_permission" "invoke_create_upload_url_permission" {
  statement_id  = "AllowAPIGatewayInvokeCreateUploadUrl"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_upload_url.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/POST/files/upload-url"
}

# Permission for API Gateway to invoke the create_download_url Lambda function
resource "aws_lambda_permission" "invoke_create_download_url_permission" {
  statement_id  = "AllowAPIGatewayInvokeCreateDownloadUrl"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_download_url.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/GET/files/*/download-url"
}

# Permission for API Gateway to invoke the create_folder Lambda function
resource "aws_lambda_permission" "invoke_create_folder_permission" {
  statement_id  = "AllowAPIGatewayInvokeCreateFolder"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_folder.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/POST/folders"
}

# TODO: Add permissions for other Lambda functions

# --- Output --- 

# Output the API endpoint URL
output "api_endpoint" {
  description = "The invoke URL for the API Gateway endpoint"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
} 