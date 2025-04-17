variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Base name for resources to ensure uniqueness and organization"
  type        = string
  default     = "s3-file-manager"
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "S3 File Manager"
    Environment = "Development" # Or make this a variable
    ManagedBy   = "Terraform"
  }
} 