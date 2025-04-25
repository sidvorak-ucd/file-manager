const { handler } = require("./get-download-url");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { verifyTokenAndGetSub } = require("../utils/auth");

// Mock dependencies
jest.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: jest.fn(() => ({})),
    GetObjectCommand: jest.fn((args) => ({
      Bucket: args.Bucket,
      Key: args.Key,
      ResponseContentDisposition: args.ResponseContentDisposition,
    })),
  };
});

jest.mock("@aws-sdk/s3-request-presigner", () => {
  return {
    getSignedUrl: jest.fn(),
  };
});

jest.mock("../utils/auth", () => {
  return {
    verifyTokenAndGetSub: jest.fn(),
  };
});

// Backup original process.env
const originalEnv = process.env;

describe("get-download-url Lambda Handler", () => {
  beforeEach(() => {
    // Reset mocks and environment before each test
    jest.clearAllMocks();
    process.env = { ...originalEnv }; // Restore original env
    process.env.BUCKET_NAME = "test-bucket";
  });

  afterAll(() => {
    // Restore original environment after all tests
    process.env = originalEnv;
  });

  // --- Success Case ---
  it("should return a 200 with a pre-signed URL on success", async () => {
    const mockSignedUrl =
      "https://test-bucket.s3.amazonaws.com/signed-url?params";
    const mockUserId = "user-sub-123";
    const mockFilePath = "folder/file.txt";
    const encodedFilePath = encodeURIComponent(mockFilePath);

    verifyTokenAndGetSub.mockResolvedValueOnce(mockUserId);
    getSignedUrl.mockResolvedValueOnce(mockSignedUrl);

    const event = {
      headers: {
        Authorization: "Bearer valid-token",
      },
      rawPath: `/files/download/${encodedFilePath}`,
      requestContext: {
        http: { method: "GET" },
      },
    };

    const result = await handler(event);

    expect(verifyTokenAndGetSub).toHaveBeenCalledWith("valid-token");
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(Object), // Mock S3Client instance
      expect.objectContaining({
        // Mock GetObjectCommand instance
        Bucket: "test-bucket",
        Key: `${mockUserId}/${mockFilePath}`,
        ResponseContentDisposition: 'attachment; filename="file.txt"',
      }),
      { expiresIn: 300 }
    );
    expect(result.statusCode).toBe(200);
    expect(result.headers).toHaveProperty("Content-Type", "application/json");
    expect(result.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
    expect(JSON.parse(result.body)).toEqual({ downloadUrl: mockSignedUrl });
  });

  // --- Error Cases ---
  it("should return 401 if Authorization header is missing", async () => {
    const event = {
      headers: {},
      rawPath: "/files/download/file.txt",
      requestContext: { http: { method: "GET" } },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({
      message: "Unauthorized",
      error: "Missing Authorization header.",
    });
    expect(verifyTokenAndGetSub).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("should return 403 if token verification fails", async () => {
    const error = new Error("Invalid token");
    verifyTokenAndGetSub.mockRejectedValueOnce(error);

    const event = {
      headers: {
        Authorization: "Bearer invalid-token",
      },
      rawPath: "/files/download/file.txt",
      requestContext: { http: { method: "GET" } },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      message: "Forbidden",
      error: "Invalid token",
    });
    expect(verifyTokenAndGetSub).toHaveBeenCalledWith("invalid-token");
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("should return 500 if BUCKET_NAME is not set", async () => {
    delete process.env.BUCKET_NAME; // Unset the environment variable

    const event = {
      headers: {
        Authorization: "Bearer valid-token",
      },
      rawPath: "/files/download/file.txt",
      requestContext: { http: { method: "GET" } },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: "Internal server error: Bucket configuration missing.",
    });
    expect(verifyTokenAndGetSub).not.toHaveBeenCalled(); // Should fail before auth
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("should return 400 if file key is missing from path", async () => {
    const mockUserId = "user-sub-123";
    verifyTokenAndGetSub.mockResolvedValueOnce(mockUserId);

    const event = {
      headers: {
        Authorization: "Bearer valid-token",
      },
      rawPath: "/files/download/", // Missing key
      requestContext: { http: { method: "GET" } },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: "Bad Request: Missing file key.",
    });
    expect(verifyTokenAndGetSub).toHaveBeenCalledWith("valid-token");
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("should return 400 for path traversal attempt", async () => {
    const mockUserId = "user-sub-123";
    verifyTokenAndGetSub.mockResolvedValueOnce(mockUserId);
    const encodedFilePath = encodeURIComponent("../secretfile.txt");

    const event = {
      headers: { Authorization: "Bearer valid-token" },
      rawPath: `/files/download/${encodedFilePath}`,
      requestContext: { http: { method: "GET" } },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: "Bad Request: Invalid file key.",
    });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("should return 404 if getSignedUrl throws NoSuchKey", async () => {
    const mockUserId = "user-sub-123";
    const mockFilePath = "nonexistent.txt";
    const encodedFilePath = encodeURIComponent(mockFilePath);

    verifyTokenAndGetSub.mockResolvedValueOnce(mockUserId);
    const error = new Error("NoSuchKey");
    error.name = "NoSuchKey";
    getSignedUrl.mockRejectedValueOnce(error);

    const event = {
      headers: {
        Authorization: "Bearer valid-token",
      },
      rawPath: `/files/download/${encodedFilePath}`,
      requestContext: { http: { method: "GET" } },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      message: `File not found: ${mockFilePath}`,
    });
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it("should return 500 if getSignedUrl throws a generic error", async () => {
    const mockUserId = "user-sub-123";
    const mockFilePath = "file.txt";
    const encodedFilePath = encodeURIComponent(mockFilePath);

    verifyTokenAndGetSub.mockResolvedValueOnce(mockUserId);
    const error = new Error("S3 is down");
    getSignedUrl.mockRejectedValueOnce(error);

    const event = {
      headers: {
        Authorization: "Bearer valid-token",
      },
      rawPath: `/files/download/${encodedFilePath}`,
      requestContext: { http: { method: "GET" } },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: "Internal server error: Could not generate download URL.",
      error: "S3 is down",
    });
    expect(getSignedUrl).toHaveBeenCalled();
  });

  // --- CORS Preflight ---
  it("should handle OPTIONS request for CORS preflight", async () => {
    const event = {
      requestContext: {
        http: { method: "OPTIONS" },
      },
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(204);
    expect(result.body).toBe("");
    expect(result.headers).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    expect(verifyTokenAndGetSub).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
