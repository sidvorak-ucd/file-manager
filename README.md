# AWS S3 File Manager Application

This project implements a secure, scalable, cloud-based file management web application using various AWS services, as outlined in the PRD.

## Project Structure

- `/frontend`: Contains the React (TypeScript) frontend application using Material-UI (Placeholder).
- `/backend`: Contains the Node.js serverless backend, structured with separate AWS Lambda handlers for each API operation.
- `/infrastructure`: Contains the Terraform configuration files for defining and managing all AWS resources (IaC).
- `README.md`: This file, providing an overview of the project.

## Overview

- **Frontend**: User interface built with React and Material-UI for interacting with the file management system (To be implemented).
- **Backend**: Serverless API built with Node.js on AWS Lambda. It uses API Gateway for routing requests to specific Lambda handlers for:
  - Listing files (`/handlers/list-files.js`)
  - Deleting files (`/handlers/delete-file.js`)
  - Generating upload URLs (`/handlers/create-upload-url.js`)
  - Generating download URLs (`/handlers/create-download-url.js`)
  - Creating folders (`/handlers/create-folder.js`)
  - Shared AWS client logic is in `/utils/aws-clients.js`.
  - Handles business logic, file operations (via S3), and metadata management (via DynamoDB).
- **Infrastructure**: All AWS resources (S3, DynamoDB, Lambda, API Gateway, Cognito, IAM roles/policies) are managed via Terraform.
- **Authentication**: User authentication is handled by AWS Cognito, using JWT for session management.

## Testing

- The backend includes a suite of unit tests written using Jest.
- Mocks are used for AWS SDK clients to isolate handler logic (`jest.mock`).
- To run the tests:
  1. Navigate to the `backend` directory: `cd backend`
  2. Run the test command: `npm test`

## Next Steps

1.  **Apply Infrastructure**: Deploy the defined AWS resources using Terraform (`cd infrastructure && terraform apply`).
2.  **Develop Frontend**: Begin building the React frontend components in `/frontend` to interact with the deployed backend API.
3.  **Refine Backend**: Add further validation, error handling, or implement additional features as needed.
4.  **CI/CD**: Set up a CI/CD pipeline (e.g., AWS CodePipeline) for automated testing and deployment.
