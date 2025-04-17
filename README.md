# AWS S3 File Manager Application

This project implements a secure, scalable, cloud-based file management web application using various AWS services, as outlined in the PRD.

## Project Structure

- `/frontend`: Contains the React (TypeScript) frontend application using Material-UI.
- `/backend`: Contains the Node.js serverless backend code deployed as an AWS Lambda function.
- `/infrastructure`: Contains the Terraform configuration files for defining and managing all AWS resources (IaC).
- `README.md`: This file, providing an overview of the project.

## Overview

- **Frontend**: User interface built with React and Material-UI for interacting with the file management system.
- **Backend**: Serverless API built with Node.js on AWS Lambda, handling business logic, file operations (via S3), and metadata management (via DynamoDB).
- **Infrastructure**: All AWS resources (S3, DynamoDB, Lambda, API Gateway, Cognito, IAM roles/policies) are managed via Terraform.
- **Authentication**: User authentication is handled by AWS Cognito, using JWT for session management.

## Next Steps (Example)

1.  Develop the frontend components in `/frontend`.
2.  Implement the backend API logic in `/backend`.
3.  Deploy the infrastructure using Terraform commands (`plan`, `apply`) in the `/infrastructure` directory.
4.  Set up CI/CD pipeline (AWS CodePipeline definition TBD).
