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
  const s3Key = `${userId}/${fileKey}`;
  // DynamoDB key uses the raw fileKey (which includes the full path)
  const dynamoDbKey = fileKey;

  console.log(
    `Attempting to delete s3://${BUCKET_NAME}/${s3Key} and DynamoDB item PK=${userId}, SK=${dynamoDbKey}`
  );

  try {
    // TODO: Implement S3 delete
    // const deleteS3Command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
    // await s3Client.send(deleteS3Command);
    // console.log(`Successfully deleted from S3: ${s3Key}`);

    // TODO: Implement DynamoDB delete
    // const deleteDbCommand = new DeleteCommand({
    //     TableName: TABLE_NAME,
    //     Key: { owner_id: userId, file_path: dynamoDbKey }
    // });
    // await docClient.send(deleteDbCommand);
    // console.log(`Successfully deleted from DynamoDB: ${dynamoDbKey}`);

    return {
      statusCode: 200, // Or 204 No Content
      body: JSON.stringify({
        message: `File ${fileKey} deletion logic not fully implemented yet.`,
      }),
      headers: {
        "Content-Type": "application/json",
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
