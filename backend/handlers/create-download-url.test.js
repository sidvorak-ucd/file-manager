const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

// Create a Jest mock function *before* the mock factory
const mockGetSignedUrl = jest.fn();

// Mock the s3-request-presigner module, providing our mock function
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// Define constants outside describe
const MOCK_BUCKET_NAME = "mock-download-bucket";
const MOCK_DOWNLOAD_EXPIRATION = 300;
const MOCK_USER_ID = "test-user-101";

// Handler will be required within beforeEach
let createDownloadUrlHandler;

describe("createDownloadUrl Handler", () => {
  const MOCK_SIGNED_URL =
    "https://mock-bucket.s3.amazonaws.com/mock-download-url?signature=...";

  beforeAll(() => {
    // Set env vars once for the suite
    process.env.S3_BUCKET_NAME = MOCK_BUCKET_NAME;
    process.env.DOWNLOAD_URL_EXPIRATION = MOCK_DOWNLOAD_EXPIRATION.toString();
  });

  beforeEach(() => {
    // Reset modules to ensure handler picks up fresh env vars
    jest.resetModules();
    // Clear the mock function's state
    mockGetSignedUrl.mockClear();
    // Re-require the handler inside beforeEach
    createDownloadUrlHandler = require("./create-download-url").handler;
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.S3_BUCKET_NAME;
    delete process.env.DOWNLOAD_URL_EXPIRATION;
    // jest.unmock('@aws-sdk/s3-request-presigner');
  });

  // --- Test cases ---

  test("should return 401 if user ID is missing", async () => {
    const event = {
      requestContext: {},
      pathParameters: { fileKey: "test.txt" },
    };
    const response = await createDownloadUrlHandler(event);
    expect(response.statusCode).toBe(401);
  });

  test("should return 400 if fileKey path parameter is missing", async () => {
    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: MOCK_USER_ID } } },
      },
      pathParameters: {}, // Missing fileKey
    };
    const response = await createDownloadUrlHandler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain("Missing fileKey");
  });

  test("should return 200 with signed URL for a file", async () => {
    const fileKey = "path/to/my-file.zip";
    const expectedS3Key = `${MOCK_USER_ID}/${fileKey}`;

    mockGetSignedUrl.mockResolvedValue(MOCK_SIGNED_URL);

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: MOCK_USER_ID } } },
      },
      pathParameters: { fileKey: encodeURIComponent(fileKey) },
    };

    const response = await createDownloadUrlHandler(event);

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.downloadUrl).toBe(MOCK_SIGNED_URL);

    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    const [s3ClientArg, commandArg, optionsArg] =
      mockGetSignedUrl.mock.calls[0];
    expect(commandArg.constructor.name).toBe("GetObjectCommand");
    expect(commandArg.input.Bucket).toBe(MOCK_BUCKET_NAME);
    expect(commandArg.input.Key).toBe(expectedS3Key);
    expect(optionsArg.expiresIn).toBe(MOCK_DOWNLOAD_EXPIRATION);
  });

  test("should return 500 if getSignedUrl fails", async () => {
    const fileKey = "another/file.txt";
    const errorMessage = "Presigner failure";
    mockGetSignedUrl.mockRejectedValue(new Error(errorMessage));

    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: MOCK_USER_ID } } },
      },
      pathParameters: { fileKey: encodeURIComponent(fileKey) },
    };

    const response = await createDownloadUrlHandler(event);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toContain(
      "Failed to generate download URL"
    );
    expect(JSON.parse(response.body).error).toContain(errorMessage);
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  // Optional: Add test for NoSuchKey error if needed (depends on whether handler should check first)
});
