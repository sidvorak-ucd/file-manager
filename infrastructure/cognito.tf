resource "aws_cognito_user_pool" "user_pool" {
  name = "${var.project_name}-user-pool"

  # Configure password policies
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false # Adjust as needed
    require_uppercase = true
  }

  # Require email for verification and as username alias
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Optional: Configure MFA (Multi-Factor Authentication)
  # mfa_configuration = "OFF" # Can be "ON" or "OPTIONAL"

  tags = var.tags
}

resource "aws_cognito_user_pool_client" "app_client" {
  name = "${var.project_name}-app-client"

  user_pool_id = aws_cognito_user_pool.user_pool.id

  # Settings for a web application (public client)
  generate_secret     = false
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  # Configure token validity periods (values are in days)
  access_token_validity  = 1  # 1 day (min 5m, max 1d)
  id_token_validity      = 1  # 1 day (min 5m, max 1d)
  refresh_token_validity = 30 # 30 days (min 60m, max 10y)

  # Allowed OAuth settings (if using hosted UI or federation in the future)
  # callback_urls = ["http://localhost:3000/callback"] # Example for local dev
  # logout_urls   = ["http://localhost:3000/logout"]
  # allowed_oauth_flows_user_pool_client = true
  # allowed_oauth_flows                  = ["code", "implicit"]
  # allowed_oauth_scopes                 = ["openid", "email", "profile"]
  # supported_identity_providers         = ["COGNITO"]
}

# Output the User Pool ID and Client ID for frontend configuration
output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.user_pool.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.app_client.id
} 