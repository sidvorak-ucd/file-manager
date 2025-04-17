// Mock AWS SDK S3 Client and Presigner FIRST
const mockS3 = { send: jest.fn() };
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => mockS3),
  PutObjectCommand: jest.fn((params) => ({ type: "PutObjectCommand", params })),
}));

// Mock the getSignedUrl function directly
const mockSignedUrl = "https://mock-signed-url.com/upload";
const mockGetSignedUrl = jest.fn();
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// Now require necessary modules ONLY if needed for direct use in tests (usually not)
// const { PutObjectCommand } = require("@aws-sdk/client-s3");
// const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Handler will be required in beforeEach
let handler;

describe("Create Upload URL Handler", () => {
  const OLD_ENV = process.env;
  const mockBucketName = "test-upload-bucket";
  const mockUserId = "user-upload-123";
  const mockFileName = "image.jpg";
  const mockContentType = "image/jpeg";
  const mockFileSize = 1024 * 1024; // 1MB
  const expectedS3Key = `${mockUserId}/${mockFileName}`;

  beforeEach(() => {
    // Reset modules to ensure handler picks up fresh env vars/mocks
    jest.resetModules();

    // Clear mock function calls and implementations BEFORE requiring handler
    mockS3.send.mockClear();
    mockGetSignedUrl.mockClear();
    // We need to access the mocked constructor differently after resetModules
    // jest.clearAllMocks(); // Avoid this if relying on module-level mocks

    // Set environment variables
    process.env = { ...OLD_ENV };
    process.env.S3_BUCKET_NAME = mockBucketName;
    process.env.UPLOAD_URL_EXPIRATION = "3600"; // Make sure env var is set if handler uses it

    // Re-require handler AFTER resetting modules and setting env vars
    handler = require("./create-upload-url").handler;

    // Set mock resolved value for getSignedUrl for most tests
    // Access the mock function directly (defined outside the mock factory)
    mockGetSignedUrl.mockResolvedValue(mockSignedUrl);

    // Clear the mock constructor *after* handler is required if needed for specific tests
    // Example: require('@aws-sdk/client-s3').PutObjectCommand.mockClear();
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
    body: body ? JSON.stringify(body) : null, // Allow null body
  });

  test("should return 200 with a presigned URL on valid request", async () => {
    const event = createEvent(mockUserId, {
      filename: mockFileName,
      contentType: mockContentType,
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.uploadUrl).toBe(mockSignedUrl);
    expect(responseBody.s3Key).toBe(expectedS3Key);

    // Access the mocked constructor via require inside the test after resetModules
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    expect(PutObjectCommand).toHaveBeenCalledTimes(1); // Check constructor calls
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: mockBucketName,
      Key: expectedS3Key,
      ContentType: mockContentType,
    });
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(Object), // The mocked S3Client instance
      expect.objectContaining({ type: "PutObjectCommand" }), // The PutObjectCommand instance
      {
        expiresIn: 3600, // Check if expiration is set correctly by handler
      }
    );
  });

  test("should return 400 if filename is missing", async () => {
    const event = createEvent(mockUserId, { contentType: mockContentType }); // Missing filename
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Missing required parameters: filename and contentType",
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test("should return 400 if contentType is missing", async () => {
    const event = createEvent(mockUserId, { filename: mockFileName }); // Missing contentType
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: "Missing required parameters: filename and contentType",
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test("should return 401 if userId is missing", async () => {
    const event = {
      requestContext: { authorizer: { jwt: { claims: {} } } }, // Missing sub
      body: JSON.stringify({
        filename: mockFileName,
        contentType: mockContentType,
      }),
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(401); // Handler returns 401 for unauthorized
    expect(JSON.parse(response.body)).toEqual({
      message: "Unauthorized",
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
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
    ); // Match handler message
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test("should return 400 if body is null or empty", async () => {
    const event = createEvent(mockUserId, null); // Null body
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    // Match the specific message from the actual handler output for null body
    expect(JSON.parse(response.body)).toEqual({
      message: "Missing required parameters: filename and contentType",
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test("should return 500 if getSignedUrl fails", async () => {
    const errorMessage = "S3 presigner error";
    // Reset mock specifically for this test if needed, or set rejection here
    mockGetSignedUrl.mockRejectedValue(new Error(errorMessage));

    const event = createEvent(mockUserId, {
      filename: mockFileName,
      contentType: mockContentType,
    });
    const response = await handler(event);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      message: "Failed to generate upload URL",
      error: errorMessage,
    }); // Match handler message
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1); // Verify it was called before failing
  });

  test("should handle fileName with special characters", async () => {
    const specialFileName = "folder/file with spaces & symbols?.txt";
    const expectedSpecialKey = `${mockUserId}/${specialFileName}`;
    const event = createEvent(mockUserId, {
      filename: specialFileName,
      contentType: "text/plain",
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.uploadUrl).toBe(mockSignedUrl);
    expect(responseBody.s3Key).toBe(expectedSpecialKey);

    // Access the mocked constructor via require
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    expect(PutObjectCommand).toHaveBeenCalledTimes(1);
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: expectedSpecialKey,
        ContentType: "text/plain",
      })
    );
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });
});
