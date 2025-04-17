resource "aws_dynamodb_table" "file_metadata" {
  name         = "${var.project_name}-file-metadata"
  billing_mode = "PAY_PER_REQUEST"

  # Partition Key: User ID who owns the file/folder
  hash_key = "owner_id"
  # Sort Key: Full path of the file/folder (e.g., "/documents/report.pdf" or "/images/")
  range_key = "file_path"

  attribute {
    name = "owner_id"
    type = "S" # String
  }

  attribute {
    name = "file_path"
    type = "S" # String
  }

  # Additional attributes required by PRD (can be added flexibly by Lambda)
  # attribute {
  #   name = "file_id" 
  #   type = "S" 
  # }
  # attribute {
  #   name = "filename"
  #   type = "S"
  # }
  # attribute {
  #   name = "size"
  #   type = "N" # Number
  # }
  # attribute {
  #   name = "upload_timestamp"
  #   type = "S" # String (ISO 8601 format recommended)
  # }

  # Enable Point-in-Time Recovery for backups
  point_in_time_recovery {
    enabled = true
  }

  # Enable server-side encryption (default KMS key)
  server_side_encryption {
    enabled = true
  }

  tags = var.tags
} 