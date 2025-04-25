const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
// Use absolute path from Lambda runtime root
const { verifyTokenAndGetSub } = require("/var/task/utils/auth");

// Assuming S3 client is configured similarly to create-download-url.js, maybe via a shared util?
// If not, initialize here: const s3Client = new S3Client({});
// For consistency, let's assume s3Client is imported if needed, like in create-download-url.js
// If utils/aws-clients exports it, uncomment:

const s3Client = new S3Client({}); // Initialize S3 client

const bucketName = process.env.BUCKET_NAME; // Get bucket name from environment
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Replace with your frontend domain for production
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

exports.handler = async (event) => {
  // Handle CORS preflight requests
  if (event.requestContext?.http?.method === "OPTIONS") {
    console.log("[Info] Handling OPTIONS request");
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  console.log("[Info] Received event:", JSON.stringify(event, null, 2));

  if (!bucketName) {
    console.error("[Error] BUCKET_NAME environment variable is not set.");
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Internal server error: Bucket configuration missing.",
      }),
    };
  }

  // --- Authorization ---
  const authorizationHeader =
    event.headers?.authorization || event.headers?.Authorization;
  let userId;
  try {
    if (!authorizationHeader) throw new Error("Missing Authorization header.");
    const token = authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.substring(7)
      : authorizationHeader;
    userId = await verifyTokenAndGetSub(token); // Verify token and get user sub (ID)
    console.log(`[Auth] Token verified for user: ${userId}`);
  } catch (error) {
    console.error("[Auth Error] Token verification failed:", error.message);
    const statusCode =
      error.message === "Missing Authorization header." ? 401 : 403;
    return {
      statusCode: statusCode,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: statusCode === 401 ? "Unauthorized" : "Forbidden",
        error: error.message,
      }),
    };
  }
  // --- End Authorization ---

  // --- Extract File Key ---
  // Route: GET /files/download/{proxy+}
  const routePrefix = "/files/download/";
  let relativeFileKey;

  if (event.rawPath && event.rawPath.startsWith(routePrefix)) {
    relativeFileKey = decodeURIComponent(
      event.rawPath.substring(routePrefix.length)
    );
  }

  if (!relativeFileKey) {
    console.error(
      "[Error] File key missing or invalid in request path:",
      event.rawPath
    );
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Bad Request: Missing file key." }),
    };
  }

  if (relativeFileKey.includes("..")) {
    console.error(
      "[Error] Potential directory traversal attempt:",
      relativeFileKey
    );
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Bad Request: Invalid file key." }),
    };
  }

  const s3Key = `${userId}/${relativeFileKey}`;
  console.log(
    `[Info] Generating download URL for bucket: ${bucketName}, key: ${s3Key}`
  );
  // --- End Extract File Key ---

  // --- Generate Pre-signed URL ---
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    ResponseContentDisposition: `attachment; filename="${relativeFileKey
      .split("/")
      .pop()}"`,
  });

  try {
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // Expires in 5 minutes
    console.log(`[Success] Generated pre-signed URL for ${s3Key}`);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ downloadUrl: signedUrl }),
    };
  } catch (error) {
    console.error(
      `[Error] Failed to generate pre-signed URL for key ${s3Key}:`,
      error
    );

    if (error.name === "NoSuchKey") {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: `File not found: ${relativeFileKey}` }),
      };
    }

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Internal server error: Could not generate download URL.",
        error: error.message,
      }),
    };
  }
  // --- End Generate Pre-signed URL ---
};
