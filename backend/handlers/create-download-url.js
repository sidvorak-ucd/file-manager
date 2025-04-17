const { s3Client } = require("../utils/aws-clients");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const DOWNLOAD_EXPIRATION = parseInt(
  process.env.DOWNLOAD_URL_EXPIRATION || "300"
); // Default 5 minutes

exports.handler = async (event) => {
  console.log(
    "Received event for createDownloadUrl:",
    JSON.stringify(event, null, 2)
  );

  const userId = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }

  // Extract fileKey from path parameter (assuming route is /files/{fileKey}/download-url)
  const fileKey = event.pathParameters?.fileKey
    ? decodeURIComponent(event.pathParameters.fileKey)
    : null;
  if (!fileKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing fileKey path parameter" }),
    };
  }

  // Construct the S3 key
  const s3Key = `${userId}/${fileKey}`;

  console.log(
    `Generating download URL for key: ${s3Key} in bucket: ${BUCKET_NAME}`
  );

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    // Optional: Specify ResponseContentDisposition for forcing download with a specific filename
    // ResponseContentDisposition: `attachment; filename="${filename}"` // Need filename from somewhere (e.g., DynamoDB lookup first?)
  });

  try {
    // Note: For GET requests, we might need to check if the user actually owns the file (query DynamoDB)
    // before generating the URL, depending on security requirements.
    // For simplicity here, we assume the path parameter implies ownership request.

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: DOWNLOAD_EXPIRATION,
    });

    console.log(`Generated URL: ${signedUrl}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ downloadUrl: signedUrl }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Adjust in production
      },
    };
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    // Handle potential S3 errors like NoSuchKey if the object doesn't exist
    if (error.name === "NoSuchKey") {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "File not found" }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to generate download URL",
        error: error.message,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};
