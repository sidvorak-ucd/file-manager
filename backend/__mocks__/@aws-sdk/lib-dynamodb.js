// backend/__mocks__/@aws-sdk/lib-dynamodb.js

// Create a mock send function that we can control from our tests
const mockSend = jest.fn();

// Mock the DocumentClient class
const MockDynamoDBDocumentClient = jest.fn(() => ({
  send: mockSend, // Instances will have this mock send method
}));

// Mock the static .from() method - returning an instance with the mock send
MockDynamoDBDocumentClient.from = jest.fn(() => ({
  send: mockSend,
}));

// Re-export everything from the actual module
const actualLib = jest.requireActual("@aws-sdk/lib-dynamodb");

module.exports = {
  ...actualLib,
  DynamoDBDocumentClient: MockDynamoDBDocumentClient,
  // Export the mockSend function so tests can access it
  __mockSend: mockSend,
};
