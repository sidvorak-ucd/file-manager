const { describe, it, expect, beforeEach } = require("@jest/globals");

// Mock AWS SDK clients FIRST using jest.mock
const mockS3 = { send: jest.fn() };
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => mockS3),
  DeleteObjectCommand: jest.fn((params) => ({
    type: "DeleteObjectCommand",
    params,
  })),
}));

const mockDynamoDB = { send: jest.fn() };
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => mockDynamoDB,
  },
  DeleteCommand: jest.fn((params) => ({ type: "DeleteCommand", params })),
}));

const { S3ServiceException } = require("@aws-sdk/client-s3");
const { DynamoDBServiceException } = require("@aws-sdk/client-dynamodb");

const MOCK_BUCKET_NAME = "mock-bucket";
const MOCK_TABLE_NAME = "mock-table";
const mockUserId = "mock-user-id-123";
const mockFileKey = "data/test.txt";
const mockFileKeyEncoded = encodeURIComponent(mockFileKey);
const expectedS3Key = `${mockUserId}/${mockFileKey}`;

describe("deleteFile Lambda Handler", () => {
  let handler;

  beforeEach(() => {
    // Clear mocks
    mockS3.send.mockClear();
    mockDynamoDB.send.mockClear();
    // Clear constructor mocks
    require("@aws-sdk/client-s3").DeleteObjectCommand.mockClear();
    require("@aws-sdk/lib-dynamodb").DeleteCommand.mockClear();

    // Set env vars before requiring the handler
    process.env.S3_BUCKET_NAME = MOCK_BUCKET_NAME;
    process.env.DYNAMODB_TABLE_NAME = MOCK_TABLE_NAME;
    // Reset modules to ensure handler gets fresh env vars and mocks
    jest.resetModules();
    // Require handler inside beforeEach
    handler = require("./delete-file").handler;
  });

  it("should return 401 if user ID is missing", async () => {
    const event = {
      requestContext: { authorizer: { jwt: { claims: {} } } }, // No sub
      pathParameters: { fileKey: mockFileKeyEncoded },
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      message: "Unauthorized",
    });
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
    expect(mockS3.send).not.toHaveBeenCalled();
  });

  it("should return 400 if fileKey is missing", async () => {
    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      pathParameters: {}, // Missing fileKey
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Missing fileKey path parameter",
    });
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
    expect(mockS3.send).not.toHaveBeenCalled();
  });

  it("should return 204 on successful deletion", async () => {
    mockDynamoDB.send.mockResolvedValue({}); // DynamoDB delete successful
    mockS3.send.mockResolvedValue({}); // S3 delete successful

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      pathParameters: { fileKey: mockFileKeyEncoded },
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBeFalsy();

    // Verify DynamoDB DeleteCommand constructor call
    const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
    expect(DeleteCommand).toHaveBeenCalledTimes(1);
    expect(DeleteCommand).toHaveBeenCalledWith({
      TableName: MOCK_TABLE_NAME,
      Key: {
        owner_id: mockUserId,
        file_path: mockFileKey,
      },
    });
    // Verify DDB send call
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DeleteCommand" })
    );

    // Verify S3 DeleteObjectCommand constructor call
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    expect(DeleteObjectCommand).toHaveBeenCalledTimes(1);
    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: MOCK_BUCKET_NAME,
      Key: expectedS3Key,
    });
    // Verify S3 send call
    expect(mockS3.send).toHaveBeenCalledTimes(1);
    expect(mockS3.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DeleteObjectCommand" })
    );
  });

  it("should return 500 if DynamoDB delete fails", async () => {
    const dynamoDbError = new DynamoDBServiceException({
      name: "DynamoDBError",
      message: "DynamoDB delete failed",
      $metadata: {},
    });
    mockDynamoDB.send.mockRejectedValue(dynamoDbError);
    mockS3.send.mockResolvedValue({}); // Assume S3 would succeed if called

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      pathParameters: { fileKey: mockFileKeyEncoded },
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to delete file",
      error: "DynamoDB delete failed",
    });
    // Verify constructor and send
    const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
    expect(DeleteCommand).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockS3.send).not.toHaveBeenCalled();
  });

  it("should return 500 if S3 delete fails (after successful DynamoDB delete)", async () => {
    // Use a generic Error for the mock rejection
    const s3ErrorMessage = "S3 delete failed";
    const s3Error = new Error(s3ErrorMessage);

    mockDynamoDB.send.mockResolvedValue({}); // DynamoDB delete successful
    mockS3.send.mockRejectedValue(s3Error); // S3 delete fails

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: mockUserId } } },
      },
      pathParameters: { fileKey: mockFileKeyEncoded },
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to delete file",
      error: s3ErrorMessage, // Expect the generic error message
    });

    // Verify constructors and send calls
    const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    expect(DeleteCommand).toHaveBeenCalledTimes(1);
    expect(DeleteObjectCommand).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockS3.send).toHaveBeenCalledTimes(1);
  });
});
