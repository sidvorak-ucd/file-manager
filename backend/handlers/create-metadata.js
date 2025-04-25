const { docClient } = require("../utils/aws-clients");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// Helper to extract filename from path
const extractFilename = (filePath) => {
  // Remove trailing slash if present (though unlikely for files)
  const pathWithoutTrailingSlash = filePath.endsWith("/")
    ? filePath.slice(0, -1)
    : filePath;
  // Get the last part after the last slash
  return pathWithoutTrailingSlash.split("/").pop();
};

exports.handler = async (event) => {
  console.log("Received S3 event:", JSON.stringify(event, null, 2));

  if (!TABLE_NAME) {
    console.error("DynamoDB table name environment variable not set.");
    // Cannot proceed without table name
    // In a real scenario, might throw error to leverage Lambda retries
    return { statusCode: 500, body: "Internal configuration error" };
  }

  const records = event.Records;
  if (!records || records.length === 0) {
    console.log("No records found in the event.");
    return { statusCode: 200, body: "No records to process" };
  }

  // Process each record (usually only one for PUT)
  for (const record of records) {
    if (record.eventName && record.eventName.startsWith("ObjectCreated")) {
      const bucketName = record.s3?.bucket?.name;
      const objectKey = record.s3?.object?.key
        ? decodeURIComponent(record.s3.object.key.replace(/\+/g, " "))
        : null;
      const objectSize = record.s3?.object?.size;
      const eventTime = record.eventTime || new Date().toISOString();

      if (!bucketName || !objectKey || objectSize === undefined) {
        console.error("Missing S3 event data in record:", record);
        continue; // Skip this record
      }

      // Assuming key format: <userId>/<filePath>
      // Example: 'cognito-user-sub-123/folder/subfolder/image.jpg'
      // We need robust parsing here
      const keyParts = objectKey.split("/");
      if (keyParts.length < 2) {
        console.error(
          `Invalid object key format for metadata extraction: ${objectKey}. Expected <userId>/<filePath>.`
        );
        continue; // Skip invalid format
      }

      // Check if it's potentially a placeholder for a folder created directly in S3 (size 0, ends with /)
      // We generally prevent this via UI, but handle defensively.
      // The create-folder handler should be the source of truth for folder entries.
      if (objectSize === 0 && objectKey.endsWith("/")) {
        console.log(
          `Skipping metadata creation for potential folder object: ${objectKey}`
        );
        continue;
      }

      const ownerId = keyParts[0];
      const filePath = keyParts.slice(1).join("/"); // Reconstruct path relative to user
      const filename = extractFilename(filePath);

      if (!ownerId || !filePath || !filename) {
        console.error(
          `Could not parse ownerId, filePath, or filename from key: ${objectKey}`
        );
        continue;
      }

      const fileItem = {
        owner_id: ownerId,
        file_path: filePath, // Relative path used as Sort Key
        filename: filename,
        size: objectSize,
        created_at: eventTime, // Or use upload time if available/preferred
        is_folder: false,
        // Add last_modified? Could use eventTime or get from S3 metadata if needed
        // Add contentType? Would need HEAD object or get from event if available
      };

      console.log("Attempting to create metadata item:", fileItem);

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: fileItem,
      });

      try {
        await docClient.send(command);
        console.log(
          `Successfully created metadata for s3://${bucketName}/${objectKey}`
        );
      } catch (error) {
        console.error(
          `Error creating DynamoDB metadata for ${objectKey}:`,
          error
        );
        // Depending on the error, might want to throw to trigger retry
      }
    } else {
      console.log(`Skipping non-ObjectCreated event: ${record.eventName}`);
    }
  }

  return { statusCode: 200, body: "Event processed" };
};
