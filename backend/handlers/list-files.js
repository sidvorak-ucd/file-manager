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

  const requestedPath = queryParams.path || "/";

  let params;
  let isRootQuery = false; // Flag to indicate if we need post-query filtering for root

  if (requestedPath === "/") {
    // Query for ALL items for the user
    isRootQuery = true;
    params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "owner_id = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };
  } else {
    // Ensure path ends with a slash for begins_with query
    const queryPath = requestedPath.endsWith("/")
      ? requestedPath
      : requestedPath + "/";
    // Query for items starting with the folder path
    params = {
      TableName: TABLE_NAME,
      KeyConditionExpression:
        "owner_id = :userId AND begins_with(file_path, :pathPrefix)",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":pathPrefix": queryPath,
      },
    };
  }

  console.log("DynamoDB Query Params:", JSON.stringify(params));

  try {
    const command = new QueryCommand(params);
    const data = await docClient.send(command);
    let items = data.Items || [];
    console.log(
      `Query successful, initially found ${items.length} items for user ${userId}, path ${requestedPath}`
    );

    // --- Post-Query Filtering ---
    const normalizedRequestPath = requestedPath.endsWith("/")
      ? requestedPath
      : requestedPath + "/";
    const requestPathDepth = normalizedRequestPath
      .split("/")
      .filter(Boolean).length;

    items = items.filter((item) => {
      const itemPath = item.file_path;
      const itemPathParts = itemPath.split("/").filter(Boolean);

      // Determine the effective depth of the item
      // A folder like 'a/b/c/' has depth 3 (parts: a, b, c)
      // A file like 'a/b/file.txt' has depth 3 (parts: a, b, file.txt)
      const itemDepth = itemPathParts.length;

      if (isRootQuery) {
        // Root items: depth is 1
        return itemDepth === 1;
      } else {
        // Subdirectory items:
        // 1. Must start with the requested path
        // 2. Depth must be exactly one more than the requested path's depth
        // 3. Exclude the folder itself (e.g., if querying 'a/b/', exclude item 'a/b/')
        if (itemPath === normalizedRequestPath && item.is_folder) {
          return false;
        }
        return (
          itemPath.startsWith(normalizedRequestPath) &&
          itemDepth === requestPathDepth + 1
        );
      }
    });
    console.log(
      `Found ${items.length} direct children items after filtering for path '${requestedPath}'.`
    );
    // --- End Post-Query Filtering ---

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
