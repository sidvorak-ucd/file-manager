const { docClient } = require("../utils/aws-clients");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

exports.handler = async (event) => {
  console.log(
    "Received event for createFolder:",
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
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid request body format" }),
    };
  }

  const { folderPath } = body;

  if (
    !folderPath ||
    typeof folderPath !== "string" ||
    folderPath.trim().length === 0
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing or invalid required parameter: folderPath",
      }),
    };
  }

  // Normalize folder path: remove leading/trailing slashes, ensure one trailing slash
  let normalizedPath = folderPath
    .trim()
    .replace(/^\/+/, "") // Remove leading slashes
    .replace(/\/+$/, ""); // Remove trailing slashes

  // Add single trailing slash (unless it's empty, representing root)
  if (normalizedPath.length > 0) {
    normalizedPath += "/";
  }

  // Optional: Add validation for path characters if needed

  const folderItem = {
    owner_id: userId,
    file_path: normalizedPath, // Should now be correctly normalized
    is_folder: true, // Attribute to identify as folder
    filename: normalizedPath.split("/").filter(Boolean).pop(), // Extract last part as name
    created_at: new Date().toISOString(),
    size: 0, // Folders have size 0
  };

  console.log("Attempting to create folder item:", folderItem);

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: folderItem,
    // Optional: Add ConditionExpression to prevent overwriting existing items (files or folders) at the same path
    // ConditionExpression: "attribute_not_exists(file_path)"
  });

  try {
    await docClient.send(command);
    console.log(`Successfully created folder entry for ${normalizedPath}`);

    // Construct the response body explicitly from the item we created
    const responseBody = {
      owner_id: folderItem.owner_id,
      file_path: folderItem.file_path, // Use the normalized path
      is_folder: folderItem.is_folder,
      filename: folderItem.filename,
      created_at: folderItem.created_at,
      size: folderItem.size,
    };

    return {
      statusCode: 201,
      body: JSON.stringify(responseBody), // Stringify the explicit response body
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error creating folder entry in DynamoDB:", error);
    // Handle potential conditional check failure (if added)
    if (error.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409, // Conflict
        body: JSON.stringify({
          message: `Folder or file already exists at path: ${normalizedPath}`,
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to create folder",
        error: error.message,
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};
