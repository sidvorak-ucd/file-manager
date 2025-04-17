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

# Lambda Integration
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api_handler.invoke_arn
  payload_format_version = "2.0" # Recommended for HTTP APIs
}

# Default Route - Proxy all requests to Lambda, protected by Cognito
resource "aws_apigatewayv2_route" "proxy_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "ANY /{proxy+}" # Catch-all route

  target = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"

  # Apply the Cognito JWT authorizer
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_auth.id
}

# OPTIONS route for CORS preflight (does not need authorization)
resource "aws_apigatewayv2_route" "options_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "OPTIONS /{proxy+}"

  # Integration for OPTIONS is not strictly required if CORS is handled by the API Gateway config itself
  # If more complex CORS logic is needed, point this to a specific integration or mock integration.
  # For simplicity with basic CORS config, we can omit the target.
  # target = "integrations/mock" # Example if a mock target was defined
}

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

# Permission for API Gateway to invoke the Lambda function
resource "aws_lambda_permission" "api_gw_lambda_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_handler.function_name
  principal     = "apigateway.amazonaws.com"

  # Restrict to the specific API Gateway ARN
  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# Output the API endpoint URL
output "api_endpoint" {
  description = "The invoke URL for the API Gateway endpoint"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
} 