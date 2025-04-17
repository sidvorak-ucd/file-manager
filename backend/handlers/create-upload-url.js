const { s3Client } = require("../utils/aws-clients");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const UPLOAD_EXPIRATION = parseInt(process.env.UPLOAD_URL_EXPIRATION || "300"); // Default 5 minutes

exports.handler = async (event) => {
  console.log(
    "Received event for createUploadUrl:",
    JSON.stringify(event, null, 2)
  );

  const userId = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    console.error("Failed to parse request body:", e);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid request body format" }),
    };
  }

  const { filename, contentType, pathPrefix } = body;

  if (!filename || !contentType) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing required parameters: filename and contentType",
      }),
    };
  }

  // Clean and construct the path and key
  // Normalize pathPrefix: remove leading/trailing slashes, default to empty string if null/undefined
  const normalizedPathPrefix = pathPrefix
    ? pathPrefix.replace(/^\/+/, "").replace(/\/+$/, "")
    : "";
  // Combine path and filename, ensuring no double slashes
  const relativeFileKey = normalizedPathPrefix
    ? `${normalizedPathPrefix}/${filename}`
    : filename;
  // Prepend userId to create the final S3 key
  const s3Key = `${userId}/${relativeFileKey}`;

  console.log(
    `Generating upload URL for key: ${s3Key} in bucket: ${BUCKET_NAME}`
  );

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: contentType,
    // Optional: Add metadata, ACL (if needed and bucket allows), etc.
    // Metadata: {
    //     'user-id': userId
    // }
  });

  try {
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: UPLOAD_EXPIRATION,
    });

    console.log(`Generated URL: ${signedUrl}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        uploadUrl: signedUrl,
        key: relativeFileKey, // Return the key relative to the user's root
        s3Key: s3Key, // Also return the full S3 key for potential reference
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Adjust in production
      },
    };
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to generate upload URL",
        error: error.message,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Adjust in production
      },
    };
  }
};
