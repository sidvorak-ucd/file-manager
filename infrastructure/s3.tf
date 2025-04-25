resource "aws_s3_bucket" "file_storage" {
  bucket = "${var.project_name}-file-storage-${random_id.bucket_suffix.hex}" # Ensure unique bucket name

  tags = var.tags

  # Prevent accidental deletion
  # Consider enabling termination protection in production
  # lifecycle {
  #   prevent_destroy = true
  # }
}

# Add random suffix to bucket name to ensure global uniqueness
resource "random_id" "bucket_suffix" {
  byte_length = 8
}

resource "aws_s3_bucket_server_side_encryption_configuration" "file_storage_encryption" {
  bucket = aws_s3_bucket.file_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "file_storage_cors" {
  bucket = aws_s3_bucket.file_storage.id

  cors_rule {
    allowed_headers = ["*"] // Allow all headers for simplicity in dev
    allowed_methods = ["PUT", "POST", "GET", "DELETE"] // Allow necessary methods for uploads/downloads
    allowed_origins = ["http://localhost:5173"] // Allow requests from the Vite dev server
    expose_headers  = ["ETag"] // Expose ETag header, useful for uploads
    max_age_seconds = 3000 // Cache preflight response for 50 minutes
  }

  # Add another cors_rule block for your production frontend URL later
  # cors_rule {
  #   allowed_headers = ["Authorization", "Content-Type"]
  #   allowed_methods = ["GET", "PUT", "POST", "DELETE"]
  #   allowed_origins = ["https://your-production-domain.com"]
  #   expose_headers  = ["ETag"]
  #   max_age_seconds = 3000
  # }
}

resource "aws_s3_bucket_public_access_block" "file_storage_public_access" {
  bucket = aws_s3_bucket.file_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "file_storage_versioning" {
  bucket = aws_s3_bucket.file_storage.id
  versioning_configuration {
    status = "Enabled" # Optional: Enable versioning based on requirements
  }
}

# Optional: Lifecycle rule to manage object versions or transition storage classes
# resource "aws_s3_bucket_lifecycle_configuration" "file_storage_lifecycle" {
#   bucket = aws_s3_bucket.file_storage.id
# 
#   rule {
#     id = "log"
#     
#     filter {
#       prefix = "log/"
#     }
#     
#     status = "Enabled"
# 
#     transition {
#       days          = 30
#       storage_class = "STANDARD_IA" # Move logs to Infrequent Access after 30 days
#     }
# 
#     expiration {
#       days = 90 # Delete logs after 90 days
#     }
#   }
# } 