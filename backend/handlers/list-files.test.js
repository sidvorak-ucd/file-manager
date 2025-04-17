const { describe, it, expect, beforeEach } = require("@jest/globals");

// Mock DynamoDB client FIRST using jest.mock
const mockDynamoDB = { send: jest.fn() };
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => mockDynamoDB,
  },
  // Mock the command constructor as well
  QueryCommand: jest.fn((params) => ({ type: "QueryCommand", params })),
  ScanCommand: jest.fn((params) => ({ type: "ScanCommand", params })), // Assuming Scan might be used later
}));

const MOCK_TABLE_NAME = "mock-table";
const mockUserId = "mock-user-id-123";
process.env.DYNAMODB_TABLE_NAME = MOCK_TABLE_NAME;

// Handler function - needs to be required *after* env vars and mocks are set up
let handler;

describe("listFiles Lambda Handler", () => {
  beforeEach(() => {
    // Reset mocks and environment variables before each test
    jest.resetModules();
    mockDynamoDB.send.mockClear();
    // Clear the constructor mock
    require("@aws-sdk/lib-dynamodb").QueryCommand.mockClear();

    // Set env vars before requiring handler
    process.env.DYNAMODB_TABLE_NAME = MOCK_TABLE_NAME;

    // Re-require the handler for a clean state
    handler = require("./list-files").handler;
  });

  it("should return 401 if user ID is missing", async () => {
    const event = {
      requestContext: { authorizer: { jwt: { claims: {} } } }, // No sub
      queryStringParameters: null,
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      message: "Unauthorized: User identifier missing.",
    });
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  it("should return 200 and list files for the root path", async () => {
    const mockItems = [{ file_id: "1", filename: "file1.txt" }];
    mockDynamoDB.send.mockResolvedValue({ Items: mockItems });

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      queryStringParameters: null, // No path means root
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(mockItems);

    // Verify the constructor was called correctly
    const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(QueryCommand).toHaveBeenCalledWith({
      TableName: MOCK_TABLE_NAME,
      KeyConditionExpression:
        "owner_id = :userId AND begins_with(file_path, :pathPrefix)",
      ExpressionAttributeValues: {
        ":userId": mockUserId,
        ":pathPrefix": "/", // Expect root path
      },
    });

    // Verify send was called
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "QueryCommand" })
    );
  });

  it("should return 200 and list files for a specific path", async () => {
    const specificPath = "myFolder/subFolder/";
    const mockItems = [{ file_id: "2", filename: "file2.pdf" }];
    mockDynamoDB.send.mockResolvedValue({ Items: mockItems });

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      queryStringParameters: { path: specificPath }, // Use raw path
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(mockItems);

    // Verify constructor and send
    const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(QueryCommand).toHaveBeenCalledWith({
      TableName: MOCK_TABLE_NAME,
      KeyConditionExpression:
        "owner_id = :userId AND begins_with(file_path, :pathPrefix)",
      ExpressionAttributeValues: {
        ":userId": mockUserId,
        ":pathPrefix": specificPath, // Expect raw path (with trailing /)
      },
    });
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "QueryCommand" })
    );
  });

  it("should return 200 with an empty array if path has no files", async () => {
    const specificPath = "emptyFolder/";
    mockDynamoDB.send.mockResolvedValue({ Items: [] });

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      queryStringParameters: { path: specificPath },
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual([]);

    // Verify constructor and send
    const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(QueryCommand).toHaveBeenCalledWith({
      TableName: MOCK_TABLE_NAME,
      KeyConditionExpression:
        "owner_id = :userId AND begins_with(file_path, :pathPrefix)",
      ExpressionAttributeValues: {
        ":userId": mockUserId,
        ":pathPrefix": specificPath,
      },
    });
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "QueryCommand" })
    );
  });

  it("should return 500 if DynamoDB query fails", async () => {
    const errorMessage = "DynamoDB query failed";
    mockDynamoDB.send.mockRejectedValue(new Error(errorMessage));

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      queryStringParameters: null,
    };

    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to list files",
      error: errorMessage,
    });
    // Verify constructor and send
    const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
  });

  it("should add trailing slash to path prefix if missing", async () => {
    const specificPath = "folderWithoutSlash";
    const expectedPathPrefix = "folderWithoutSlash/";
    mockDynamoDB.send.mockResolvedValue({ Items: [] });

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      queryStringParameters: { path: specificPath },
    };

    await handler(event);

    const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(QueryCommand).toHaveBeenCalledWith({
      TableName: MOCK_TABLE_NAME,
      KeyConditionExpression:
        "owner_id = :userId AND begins_with(file_path, :pathPrefix)",
      ExpressionAttributeValues: {
        ":userId": mockUserId,
        ":pathPrefix": expectedPathPrefix, // Expect trailing slash added
      },
    });
  });
});
