const { s3Client, docClient } = require("../utils/aws-clients");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

exports.handler = async (event) => {
  console.log("Received event for deleteFile:", JSON.stringify(event, null, 2));

  // Path parameter extraction depends on API Gateway route setup (e.g., /files/{fileKey})
  // Assuming fileKey is passed as a path parameter named 'fileKey'
  const fileKey = event.pathParameters?.fileKey
    ? decodeURIComponent(event.pathParameters.fileKey)
    : null;
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub;

  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    };
  }
  if (!fileKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing fileKey path parameter" }),
    };
  }

  // Construct the S3 key (assuming objects are stored under userId prefix)
  // IMPORTANT: Ensure fileKey path parameter correctly represents the path *relative* to the user's root.
  // Example: If URL is /files/documents/report.pdf, fileKey should be 'documents/report.pdf'
  // If URL is /files/image.jpg, fileKey should be 'image.jpg'
  const s3Key = `${userId}/${fileKey}`;
  // DynamoDB key uses the raw fileKey (which includes the full path relative to user)
  const dynamoDbKey = fileKey;

  console.log(
    `Attempting to delete s3://${BUCKET_NAME}/${s3Key} and DynamoDB item PK=${userId}, SK=${dynamoDbKey}`
  );

  try {
    // 1. Delete item from DynamoDB first (or S3 first, depends on desired atomicity/rollback)
    // Let's delete from DB first. If S3 fails, the metadata is gone, but the file might remain (orphan).
    console.log(`Deleting DynamoDB item: ${dynamoDbKey} for user ${userId}`);
    const deleteDbCommand = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { owner_id: userId, file_path: dynamoDbKey },
      // Optional: Add ConditionExpression to ensure item exists or belongs to user
    });
    await docClient.send(deleteDbCommand);
    console.log(`Successfully deleted from DynamoDB: ${dynamoDbKey}`);

    // 2. Delete object from S3
    console.log(`Deleting S3 object: ${s3Key}`);
    const deleteS3Command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    await s3Client.send(deleteS3Command);
    console.log(`Successfully deleted from S3: ${s3Key}`);

    return {
      statusCode: 204, // Use 204 No Content for successful deletions
      // No body needed for 204
      headers: {
        "Content-Type": "application/json", // Content-Type might not be strictly necessary for 204
        "Access-Control-Allow-Origin": "*", // Adjust in production
      },
    };
  } catch (error) {
    console.error("Error deleting file:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to delete file",
        error: error.message,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Adjust in production
      },
    };
  }
};
