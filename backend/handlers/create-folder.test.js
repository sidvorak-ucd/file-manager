// Mock DynamoDB client FIRST
const mockDynamoDB = { send: jest.fn() };
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => mockDynamoDB,
  },
  PutCommand: jest.fn((params) => ({ type: "PutCommand", params })),
}));

// REMOVED: uuid mock is not needed
// const mockUuid = "mock-uuid-12345";
// jest.mock("uuid", () => ({ v4: () => mockUuid }));

// Handler will be required in beforeEach
let handler;

describe("createFolder Handler", () => {
  const OLD_ENV = process.env;
  const mockTableName = "test-folder-table";
  const mockUserId = "test-user-folder-creator";

  beforeEach(() => {
    jest.resetModules();
    mockDynamoDB.send.mockClear();
    // Clear PutCommand mock if needed
    // require('@aws-sdk/lib-dynamodb').PutCommand.mockClear();

    process.env = { ...OLD_ENV };
    process.env.DYNAMODB_TABLE_NAME = mockTableName;

    handler = require("./create-folder").handler;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const createEvent = (userId, body) => ({
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: userId },
        },
      },
    },
    body: body ? JSON.stringify(body) : null,
  });

  test("should return 401 if user ID is missing", async () => {
    const event = {
      requestContext: { authorizer: { jwt: { claims: {} } } },
      body: JSON.stringify({ folderPath: "test" }),
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(401);
    // Match exact handler message
    expect(JSON.parse(response.body)).toEqual({ message: "Unauthorized" });
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  test("should return 400 if folderPath is missing", async () => {
    const event = createEvent(mockUserId, {}); // Missing folderPath
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Missing or invalid required parameter: folderPath",
    });
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  test("should return 400 if folderPath is empty string", async () => {
    const event = createEvent(mockUserId, { folderPath: "  " }); // Empty folderPath
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Missing or invalid required parameter: folderPath",
    });
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  test("should return 201 on valid input for root folder", async () => {
    const folderPath = "my-root-folder";
    const expectedFileName = "my-root-folder";
    const expectedNormalizedPath = "my-root-folder/";

    mockDynamoDB.send.mockResolvedValue({});
    const event = createEvent(mockUserId, { folderPath });
    const response = await handler(event);

    expect(response.statusCode).toBe(201);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.owner_id).toBe(mockUserId);
    expect(responseBody.file_path).toBe(expectedNormalizedPath);
    expect(responseBody.filename).toBe(expectedFileName);
    expect(responseBody).not.toHaveProperty("parent_folder_id");
    expect(responseBody.is_folder).toBe(true);
    expect(responseBody.size).toBe(0);
    expect(responseBody.created_at).toBeDefined();
    expect(responseBody).not.toHaveProperty("file_id");

    const { PutCommand } = require("@aws-sdk/lib-dynamodb");
    expect(PutCommand).toHaveBeenCalledTimes(1);
    const putCommandArgs = PutCommand.mock.calls[0][0];
    expect(putCommandArgs.Item.owner_id).toBe(mockUserId);
    expect(putCommandArgs.Item.file_path).toBe(expectedNormalizedPath);
    expect(putCommandArgs.Item.filename).toBe(expectedFileName);
    expect(putCommandArgs.Item).not.toHaveProperty("parent_folder_id");
    expect(putCommandArgs.Item.is_folder).toBe(true);
    expect(putCommandArgs.Item.size).toBe(0);
    expect(putCommandArgs.Item).toHaveProperty("created_at");
    expect(putCommandArgs.Item).not.toHaveProperty("file_id");
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PutCommand" })
    );
  });

  test("should return 201 on valid input for nested folder", async () => {
    const folderPath = "parent/subfolder";
    const expectedFileName = "subfolder";
    const expectedNormalizedPath = "parent/subfolder/";

    mockDynamoDB.send.mockResolvedValue({});
    const event = createEvent(mockUserId, { folderPath });
    const response = await handler(event);

    expect(response.statusCode).toBe(201);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.owner_id).toBe(mockUserId);
    expect(responseBody.file_path).toBe(expectedNormalizedPath);
    expect(responseBody.filename).toBe(expectedFileName);
    expect(responseBody).not.toHaveProperty("parent_folder_id");
    expect(responseBody.is_folder).toBe(true);
    expect(responseBody.size).toBe(0);
    expect(responseBody.created_at).toBeDefined();
    expect(responseBody).not.toHaveProperty("file_id");

    const { PutCommand } = require("@aws-sdk/lib-dynamodb");
    expect(PutCommand).toHaveBeenCalledTimes(1);
    const putCommandArgs = PutCommand.mock.calls[0][0];
    expect(putCommandArgs.Item.owner_id).toBe(mockUserId);
    expect(putCommandArgs.Item.file_path).toBe(expectedNormalizedPath);
    expect(putCommandArgs.Item.filename).toBe(expectedFileName);
    expect(putCommandArgs.Item).not.toHaveProperty("parent_folder_id");
    expect(putCommandArgs.Item.is_folder).toBe(true);
    expect(putCommandArgs.Item.size).toBe(0);
    expect(putCommandArgs.Item).toHaveProperty("created_at");
    expect(putCommandArgs.Item).not.toHaveProperty("file_id");
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    expect(mockDynamoDB.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PutCommand" })
    );
  });

  test("should normalize folderPath correctly (leading/trailing slashes)", async () => {
    const folderPath = "//anotherfolder///";
    const expectedFileName = "anotherfolder";
    const expectedNormalizedPath = "anotherfolder/"; // Used for DB check and RESPONSE check

    mockDynamoDB.send.mockResolvedValue({});
    const event = createEvent(mockUserId, { folderPath });
    const response = await handler(event);

    expect(response.statusCode).toBe(201);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.filename).toBe(expectedFileName);
    // Revert: Expect NORMALIZED path in response body
    expect(responseBody.file_path).toBe(expectedNormalizedPath);
    expect(responseBody).not.toHaveProperty("parent_folder_id");

    // Verify PutCommand Item uses normalized path
    const { PutCommand } = require("@aws-sdk/lib-dynamodb");
    expect(PutCommand).toHaveBeenCalledTimes(1);
    const putCommandArgs = PutCommand.mock.calls[0][0];
    expect(putCommandArgs.Item.filename).toBe(expectedFileName);
    expect(putCommandArgs.Item.file_path).toBe(expectedNormalizedPath);
    expect(putCommandArgs.Item).not.toHaveProperty("parent_folder_id");
  });

  test("should return 500 on DynamoDB Put error", async () => {
    const folderPath = "error/folder/";
    const errorMessage = "DynamoDB Put error";
    mockDynamoDB.send.mockRejectedValue(new Error(errorMessage));

    const event = createEvent(mockUserId, { folderPath });
    const response = await handler(event);

    expect(response.statusCode).toBe(500);
    // Match handler message
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to create folder",
      error: errorMessage,
    });
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
  });

  test("should return 409 on ConditionalCheckFailedException", async () => {
    const folderPath = "existing/folder"; // Handler likely adds trailing slash
    const normalizedPath = "existing/folder/";
    const error = new Error("Conditional check failed");
    error.name = "ConditionalCheckFailedException";
    mockDynamoDB.send.mockRejectedValue(error);

    const event = createEvent(mockUserId, { folderPath });
    const response = await handler(event);

    expect(response.statusCode).toBe(409);
    // Match handler message including the normalized path
    expect(JSON.parse(response.body)).toEqual({
      message: `Folder or file already exists at path: ${normalizedPath}`,
    });
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
  });

  test("should return 400 if body is not valid JSON", async () => {
    const event = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: mockUserId },
          },
        },
      },
      body: "invalid-json{",
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(
      /Invalid request body format/
    );
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });

  test("should return 400 if body is null", async () => {
    const event = createEvent(mockUserId, null);
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Missing or invalid required parameter: folderPath",
    });
    expect(mockDynamoDB.send).not.toHaveBeenCalled();
  });
});
