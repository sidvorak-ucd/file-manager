const { docClient } = require("../utils/aws-clients");
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

exports.handler = async (event) => {
  console.log("Received event for listFiles:", JSON.stringify(event, null, 2));

  const queryParams = event.queryStringParameters || {};
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub;

  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: "Unauthorized: User identifier missing.",
      }),
      headers: { "Content-Type": "application/json" },
    };
  }

  // Default pathPrefix to root if not provided or empty
  const pathPrefix = queryParams.path || "/";
  const queryPath =
    pathPrefix === "/"
      ? "/"
      : pathPrefix.endsWith("/")
      ? pathPrefix
      : pathPrefix + "/";

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression:
      "owner_id = :userId AND begins_with(file_path, :pathPrefix)",
    ExpressionAttributeValues: {
      ":userId": userId,
      ":pathPrefix": queryPath,
    },
    // ProjectionExpression: "file_path, filename, size, upload_timestamp, is_folder" // Example
  };

  try {
    const command = new QueryCommand(params);
    const data = await docClient.send(command);
    const items = data.Items || [];
    console.log(
      `Found ${items.length} items for user ${userId}, prefix ${queryPath}`
    );

    // TODO: Further filtering for direct children if needed

    return {
      statusCode: 200,
      body: JSON.stringify(items),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Adjust in production
      },
    };
  } catch (error) {
    console.error("Error querying DynamoDB:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to list files",
        error: error.message,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Adjust in production
      },
    };
  }
};
