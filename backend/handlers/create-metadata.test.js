const { describe, it, expect, beforeEach } = require("@jest/globals");

// Mock DynamoDB client FIRST using jest.mock
const mockDynamoDB = { send: jest.fn() };
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => mockDynamoDB,
  },
  PutCommand: jest.fn((params) => ({ type: "PutCommand", params })),
}));

const MOCK_TABLE_NAME = "test-meta-table";
process.env.DYNAMODB_TABLE_NAME = MOCK_TABLE_NAME;

let handler;

// Helper to create a mock S3 event record
const createS3EventRecord = (bucketName, objectKey, size, eventTime) => ({
  eventVersion: "2.1",
  eventSource: "aws:s3",
  awsRegion: "us-east-1",
  eventTime: eventTime || new Date().toISOString(),
  eventName: "ObjectCreated:Put",
  userIdentity: { principalId: "AWS:EXAMPLE" },
  requestParameters: { sourceIPAddress: "127.0.0.1" },
  responseElements: {
    "x-amz-request-id": "EXAMPLE12345",
    "x-amz-id-2": "EXAMPLE123/abcdefghijk",
  },
  s3: {
    s3SchemaVersion: "1.0",
    configurationId: "testConfigRule",
    bucket: {
      name: bucketName,
      ownerIdentity: { principalId: "EXAMPLE" },
      arn: `arn:aws:s3:::${bucketName}`,
    },
    object: {
      key: objectKey, // Key should be URL-encoded in real events, but we test decoded logic
      size: size,
      eTag: "0123456789abcdef0123456789abcdef",
      versionId: "EXAMPLEVERSIONID",
      sequencer: "EXAMPLESEQUENCER",
    },
  },
});

describe("Create Metadata Handler", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDynamoDB.send.mockClear();
    require("@aws-sdk/lib-dynamodb").PutCommand.mockClear();

    process.env.DYNAMODB_TABLE_NAME = MOCK_TABLE_NAME;
    handler = require("./create-metadata").handler;
  });

  it("should create DynamoDB item for valid S3 Put event", async () => {
    const bucket = "test-bucket";
    const userId = "user-sub-123";
    const filePath = "folder/image.jpg";
    const objectKey = `${userId}/${filePath}`;
    const fileSize = 1024;
    const eventTime = new Date().toISOString();

    const event = {
      Records: [createS3EventRecord(bucket, objectKey, fileSize, eventTime)],
    };

    mockDynamoDB.send.mockResolvedValue({}); // Simulate successful Put

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("Event processed");

    const { PutCommand } = require("@aws-sdk/lib-dynamodb");
    expect(PutCommand).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);

    const expectedItem = {
      owner_id: userId,
      file_path: filePath,
      filename: "image.jpg",
      size: fileSize,
      created_at: eventTime,
      is_folder: false,
    };
    expect(PutCommand).toHaveBeenCalledWith({
      TableName: MOCK_TABLE_NAME,
      Item: expectedItem,
    });
    expect(mockDynamoDB.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PutCommand" })
    );
  });

  it("should handle keys with special characters correctly", async () => {
    const bucket = "test-bucket";
    const userId = "user-sub-456";
    const filePath = "folder with spaces/file+symbol&.png";
    // Simulate URL encoding as S3 event would have
    const objectKey = `${userId}/${filePath}`;
    const event = {
      Records: [
        createS3EventRecord(
          bucket,
          encodeURIComponent(objectKey).replace(/%20/g, "+"),
          500
        ),
      ],
    };

    mockDynamoDB.send.mockResolvedValue({});
    await handler(event);

    const { PutCommand } = require("@aws-sdk/lib-dynamodb");
    expect(PutCommand).toHaveBeenCalledTimes(1);
    expect(PutCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          owner_id: userId,
          file_path: filePath, // Expect decoded path
          filename: "file+symbol&.png",
        }),
      })
    );
  });

  it("should skip records with invalid key format", async () => {
    const event = {
      Records: [createS3EventRecord("test-bucket", "justafile.txt", 100)], // Missing userId prefix
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  it("should skip potential folder objects (size 0, ends with /)", async () => {
    const event = {
      Records: [
        createS3EventRecord("test-bucket", "user-sub-789/somefolder/", 0),
      ],
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  it("should handle DynamoDB Put error gracefully", async () => {
    const bucket = "test-bucket";
    const objectKey = "user-sub-err/error.txt";
    const errorMessage = "DynamoDB Put failed";

    const event = {
      Records: [createS3EventRecord(bucket, objectKey, 100)],
    };

    mockDynamoDB.send.mockRejectedValue(new Error(errorMessage));

    // We expect handler to log error but return 200 for S3 trigger
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    // Ideally, also check console.error was called (requires more setup or jest spyOn)
  });

  it("should handle empty records array", async () => {
    const event = { Records: [] };
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("No records to process");
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  it("should handle missing records property", async () => {
    const event = {};
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("No records to process");
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  it("should skip non-ObjectCreated events", async () => {
    const event = {
      Records: [
        {
          ...createS3EventRecord("b", "u/f.txt", 1),
          eventName: "ObjectRemoved:Delete",
        },
      ],
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });
});
