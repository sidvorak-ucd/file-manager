// backend/__mocks__/utils/aws-clients.js

// Import the MOCKED lib-dynamodb module
const { DynamoDBDocumentClient, __mockSend } = require("@aws-sdk/lib-dynamodb");
// Import the REAL S3 client (assuming no mock needed for S3 here)
const { S3Client } = jest.requireActual("@aws-sdk/client-s3");

// Create an instance using the MOCKED DocumentClient
// Note: We don't need the base DynamoDBClient here as .from is mocked
const mockDocClientInstance = DynamoDBDocumentClient.from();

// Create a real S3 client instance
const realS3ClientInstance = new S3Client({});

module.exports = {
  docClient: mockDocClientInstance, // Export the mocked docClient
  s3Client: realS3ClientInstance, // Export a real s3Client
  // We don't need to export __mockSend from here, tests will get it from the lib-dynamodb mock
};
