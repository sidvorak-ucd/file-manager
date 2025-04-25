# Product Requirements Document (PRD): AWS S3 File Manager Application

## 1. Overview

The goal is to develop a secure, scalable, cloud-based file management web application. It provides authenticated users the ability to manage files and folders stored securely in AWS S3, leveraging various AWS services including DynamoDB, Lambda, API Gateway, and Cognito, with infrastructure managed via Terraform.

## 2. Architecture

### 2.1. Frontend

- **Framework**: React with TypeScript
- **UI Framework**: Material-UI
- **Deployment**: Static hosting via AWS S3 or alternative CDN (To be implemented).

### 2.2. Backend

- **Serverless Architecture**: AWS Lambda (Node.js runtime). Structured with separate handlers for each API operation.
- **API Management**: AWS API Gateway (HTTP API) for routing requests to Lambda handlers.
- **Authentication**: AWS Cognito using JWT for session management. API Gateway endpoints are protected by a Cognito authorizer. User ID (`sub` claim) is extracted for authorization.
- **Shared Logic**: Utility functions (e.g., AWS client initialization) located in `/backend/utils`.

### 2.3. Data Storage

- **File Storage**: AWS S3.
- **Metadata Storage**: AWS DynamoDB table storing file and folder metadata (See Section 6).

### 2.4. Infrastructure & Operations

- **Infrastructure as Code (IaC)**: Terraform manages all AWS resources (S3, DynamoDB, Lambda, API Gateway, Cognito, IAM roles/policies).
- **CI/CD Pipeline**: AWS CodePipeline (or similar) for automated testing and deployment (To be implemented).
- **Monitoring & Logging**: AWS CloudWatch for Lambda logs, API Gateway metrics, and other service logs.

## 3. Functional Requirements

### 3.1. User Authentication

- Users register and authenticate through AWS Cognito.
- **Login UI**: A mechanism (e.g., dialog) for users to enter credentials.
- **Logout**: Functionality to securely log out, invalidating sessions/tokens.
- JWTs are used for session management and API authorization via API Gateway.

### 3.2. File & Folder Management (API & UI)

- **Hierarchical View**: UI displays files and folders based on the current path.
- **Navigation**:
  - Clicking folders navigates into them.
  - UI element allows navigating up one level.
- **List Items (`GET /files` API):**
  - UI calls this endpoint to list contents of the current path.
  - Accepts optional `path` query parameter (defaults to root `/`).
  - Queries DynamoDB for items belonging to the user with the matching prefix.
  - Returns JSON array of file/folder metadata.
- **Create Folder (`POST /folders` API):**
  - UI provides control (e.g., button) to trigger folder creation.
  - API accepts `folderPath` in the request body.
  * API normalizes the path (removes leading/trailing slashes, ensures one trailing slash).
  * API creates a zero-byte item in DynamoDB with `is_folder: true` and the normalized path.
  * API returns the created folder metadata.
- **Upload File (`POST /upload-url` API & UI Flow):**
  - UI provides control (e.g., button) to select files for upload.
  - UI calls API with `filename` and `contentType`.
  - API generates and returns a pre-signed S3 PUT URL scoped to `<userId>/<filePath>`.
  - UI uses the pre-signed URL to upload the file directly to S3.
  - (Note: Metadata creation in DynamoDB happens _after_ successful upload - see Open Questions).
- **Download File (`GET /download-url/{fileKey+}` API & UI Flow):**
  - UI provides control (e.g., button) on file items.
  - UI calls API with the URL-encoded relative file key.
  - API generates and returns a pre-signed S3 GET URL for the object `s3://<bucket>/<userId>/<fileKey>`.
  - UI uses this URL to initiate the browser download.
- **Delete File/Folder (`DELETE /files/{fileKey+}` API & UI Flow):**
  - UI provides control (e.g., button) on file/folder items.
  - UI calls API with the URL-encoded relative file/folder key.
  - API deletes the corresponding metadata item(s) from DynamoDB.
  - API deletes the corresponding object(s) from S3.
  - (Note: Folder deletion requires deleting all contents first - see Open Questions).

### 3.3. UI Components

- Consistent application layout.
- **Header**: Displays application title and user logout button.
- **Content Area**: Central area displaying the file/folder list for the current path.
- **Feedback**: Visual indicators for loading states, ongoing operations, and errors.

## 4. Non-functional Requirements

- **Security:**
  - All interactions secured via HTTPS.
  - Strict IAM policies for AWS resources following least privilege principle.
  - S3 buckets configured to block public access by default.
  - Server-side encryption enabled for S3 objects.
- **Scalability:** Leverage auto-scaling capabilities of Lambda, API Gateway, S3, and DynamoDB.
- **Performance:**
  - Application must efficiently handle concurrent users.
  - Use S3 pre-signed URLs for efficient direct file transfers.
  - Optimize DynamoDB queries (e.g., using appropriate keys and indexes).
- **Maintainability:**
  - Backend code follows Node.js/TypeScript best practices (as applicable).
  - Modular backend handlers.
  - Comprehensive Terraform scripts for infrastructure management.
  - Unit testing suite (Jest) for backend handlers.
  - Fully automated CI/CD pipeline.
- **Usability:** UI must be intuitive, responsive, and accessible.
- **Observability:** Detailed logging via CloudWatch for API requests, Lambda execution, and errors. Monitoring key performance metrics (latency, error rates).

## 5. Data Model (DynamoDB)

- Single table design storing file and folder metadata.
- **Key Schema:**
  - Partition Key (PK): `owner_id` (Cognito User Sub)
  - Sort Key (SK): `file_path` (Normalized path, e.g., `folder/subfolder/file.txt` or `folder/subfolder/`)
- **Attributes:**
  - `filename`: Base name of the file or folder.
  - `is_folder`: Boolean flag (true for folders).
  - `size`: File size in bytes (0 for folders).
  - `created_at`: ISO 8601 timestamp.
  - (Other attributes like `last_modified`, `contentType` may be added).

## 6. Technology Stack

- **Frontend:** React (TypeScript), Material-UI
- **Backend:** Node.js, AWS Lambda
- **API:** AWS API Gateway (HTTP API)
- **Database:** AWS DynamoDB
- **File Storage:** AWS S3
- **Authentication:** AWS Cognito
- **Infrastructure:** Terraform
- **Testing:** Jest
- **CI/CD:** AWS CodePipeline (or similar)
- **Monitoring:** AWS CloudWatch

## 7. Deliverables

- Fully operational web application meeting functional requirements.
- Comprehensive Terraform scripts for repeatable infrastructure setup.
- Documentation: README, PRD, basic deployment/operation notes.
- Automated unit test suite integrated into the CI/CD pipeline.

## 8. Assumptions

- AWS accounts and necessary permissions are pre-established for development and deployment.
- Close collaboration between frontend and backend development efforts (if applicable).

## 9. Constraints

- Adherence to AWS best practices for security, performance, and cost-optimization.
- UI implementation must follow accessibility guidelines.

## 10. Acceptance Criteria

- Users can successfully register, log in, and log out.
- Users can navigate the folder structure, including moving up levels.
- Users can create new folders.
- Users can upload files via the UI, resulting in objects in S3 and metadata in DynamoDB.
- Users can download files via the UI.
- Users can delete files and folders via the UI, removing objects from S3 and metadata from DynamoDB.
- All API endpoints are secured and require valid authentication.
- Infrastructure can be deployed repeatably using Terraform scripts.
- Unit tests pass consistently in the CI/CD pipeline.
- Application meets defined security, scalability, maintainability, and observability standards.

## 11. Out of Scope / Future Enhancements

- Advanced search/filtering capabilities.
- File sharing features (inter-user or public links).
- File versioning UI / restore capabilities.
- Real-time collaboration features.
- Admin interfaces.
- Explicit handling of recursive folder deletion (requires careful implementation).
- Mechanism for creating DynamoDB metadata _after_ successful S3 upload (needs detailed design - S3 Event or frontend confirmation).
- Granular error handling and user feedback improvement.
