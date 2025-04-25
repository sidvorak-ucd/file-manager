import React, { useState, useEffect, useRef, useCallback } from "react";
import { get, post, del } from "@aws-amplify/api"; // Import the get, post, and del functions from the API category
import { fetchAuthSession } from "aws-amplify/auth"; // Import Auth category for checking session
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link as MuiLink, // Alias Link to avoid clash with potential Router Link
  IconButton,
  Box,
  Snackbar,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Folder as FolderIcon,
  Article as FileIcon,
  ArrowUpward as ArrowUpwardIcon,
  CloudUpload as CloudUploadIcon,
  CreateNewFolder as CreateNewFolderIcon,
  MoreVert as MoreVertIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
// import axios from 'axios'; // We'll need this later

// API Name from aws-exports.js
const API_NAME = "FileManagementAPI";

// --- Define Types ---
interface FileItem {
  filename: string;
  file_path: string;
  is_folder: boolean;
  size: number;
  created_at: string; // ISO 8601 string
  // Add other potential fields if needed, e.g., last_modified: string;
}

// Type for the successful response from the create folder endpoint
interface CreatedFolderResponse extends FileItem {}

// Type for the error response from API Gateway/Lambda
interface ErrorResponse {
  message: string;
  error?: string; // Optional additional error details
}

// Type for the successful response from the get download URL endpoint
interface GetDownloadUrlResponse {
  downloadUrl: string;
}

interface FileManagerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any; // Replace 'any' with a proper User type from Amplify later
  signOut?: (data?: any) => void; // Simplified signOut type
}

// Placeholder API function (replace with actual API call)
// Removed mock fetchFiles function

// Helper to generate breadcrumbs
const generateBreadcrumbs = (
  path: string,
  navigateToPath: (path: string) => void
) => {
  const parts = path.split("/").filter(Boolean);
  let currentPath = "/";
  const breadcrumbs = [
    <MuiLink
      key="root"
      component="button"
      underline="hover"
      color="inherit"
      onClick={() => navigateToPath("/")}
    >
      Home
    </MuiLink>,
  ];

  parts.forEach((part, index) => {
    currentPath += `${part}/`;
    const isLast = index === parts.length - 1;
    if (isLast) {
      breadcrumbs.push(
        <Typography key={currentPath} color="text.primary">
          {part}
        </Typography>
      );
    } else {
      const pathToNavigate = currentPath;
      breadcrumbs.push(
        <MuiLink
          key={currentPath}
          component="button"
          underline="hover"
          color="inherit"
          onClick={() => navigateToPath(pathToNavigate)}
        >
          {part}
        </MuiLink>
      );
    }
  });

  return breadcrumbs;
};

const FileManager: React.FC<FileManagerProps> = ({ signOut, user }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("/"); // Start at root
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false); // Upload specific loading state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  // --- State for Deletion ---
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<FileItem | null>(
    null
  ); // Item to delete
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null); // For action menu
  const [currentItemForMenu, setCurrentItemForMenu] = useState<FileItem | null>(
    null
  ); // Track which item's menu is open

  const handleSignOut = () => {
    if (signOut) {
      signOut();
    } else {
      console.warn("SignOut function not provided");
    }
  };

  // --- Define loadFiles using useCallback ---
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    console.log(`Fetching files for path: ${currentPath}`);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("User session invalid or token missing.");
      console.log("Auth session valid for loadFiles.");

      // --- Add detailed logging before API call ---
      const apiPath = "/files";
      const queryPath = currentPath === "/" ? "" : currentPath;
      const apiOptions = {
        queryParams: { path: queryPath },
        headers: { Authorization: idToken },
      };
      console.log(
        `PREPARE API CALL: API_NAME=${API_NAME}, Path=${apiPath}, QueryPath=${queryPath}`
      );
      console.log("PREPARE API CALL: Options=", JSON.stringify(apiOptions));
      // --- End detailed logging ---

      const restOperation = get({
        apiName: API_NAME,
        path: apiPath,
        options: apiOptions,
      });
      console.log("INITIATED API.get call."); // Added log

      const response = await restOperation.response;
      console.log("Raw API response:", response);

      // Use safer type assertion via unknown
      const fetchedFiles =
        (await response.body.json()) as unknown as FileItem[];

      console.log("Parsed API response body:", fetchedFiles);

      fetchedFiles.sort((a, b) => {
        if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1;
        return a.filename.localeCompare(b.filename);
      });
      setFiles(fetchedFiles);
    } catch (err: any) {
      console.error("Error loading files:", err);
      setError(`Failed to load files: ${err.message || "Please try again."}`);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
    // Add dependencies for useCallback
  }, [currentPath]);
  // --- End loadFiles definition ---

  // Fetch files when component mounts or path changes
  useEffect(() => {
    loadFiles();
    // loadFiles is now a dependency of useEffect
  }, [loadFiles]);

  const handleNavigate = (item: FileItem) => {
    if (item.is_folder) {
      setCurrentPath(item.file_path); // Navigate into folder
    }
    // TODO: Handle file click (e.g., download)
  };

  const handleNavigatePath = (path: string): void => {
    setCurrentPath(path);
  };

  const handleNavigateUp = (): void => {
    if (currentPath === "/") return; // Already at root
    const pathParts = currentPath.split("/").filter(Boolean);
    pathParts.pop(); // Remove last part
    const newPath = pathParts.length > 0 ? pathParts.join("/") + "/" : "/";
    setCurrentPath(newPath);
  };

  // --- Create Folder Logic ---
  const openCreateFolderModal = (): void => {
    setNewFolderName("");
    setIsCreateFolderModalOpen(true);
  };

  const closeCreateFolderModal = (): void => {
    setIsCreateFolderModalOpen(false);
  };

  const handleCreateFolderSubmit = async (): Promise<void> => {
    if (!newFolderName.trim()) {
      setError("Folder name cannot be empty.");
      return;
    }
    if (newFolderName.includes("/")) {
      setError("Folder name cannot contain slashes.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const basePath = currentPath === "/" ? "" : currentPath;
    const fullFolderPath = `${basePath}${newFolderName.trim()}/`;

    try {
      console.log(`Attempting to create folder: ${fullFolderPath}`);
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Authentication session invalid");

      const restOperation = post({
        apiName: API_NAME,
        path: "/folders",
        options: {
          body: { folderPath: fullFolderPath },
          headers: { Authorization: idToken },
        },
      });

      const response = await restOperation.response;
      const responseBody = await response.body.json();

      if (response.statusCode === 201) {
        console.log("Folder created successfully:", responseBody);
        // We can optionally use the returned data if needed, assuming it matches CreatedFolderResponse
        // const createdItem = responseBody as CreatedFolderResponse;
        setSuccessMessage(`Folder "${newFolderName.trim()}" created.`);
        closeCreateFolderModal();
        loadFiles(); // Refresh the file list
      } else {
        // Attempt to parse as ErrorResponse
        const errorBody = responseBody as unknown as ErrorResponse; // Cast via unknown
        throw new Error(
          errorBody?.message || `Failed with status: ${response.statusCode}`
        );
      }
    } catch (err: any) {
      console.error("Error creating folder:", err);
      // Amplify error structure might differ, try accessing message directly
      // Check err.response as well if Amplify wraps underlying fetch/axios errors
      let errorMessage = "Failed to create folder.";
      if (err.message) {
        errorMessage = err.message;
      }
      // Check if the backend-specific message is embedded
      if (errorMessage.includes("already exists")) {
        // Keep the specific message if backend provided it
        setError(errorMessage);
      } else {
        // General error message
        setError(`Failed to create folder: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };
  // --- End Create Folder Logic ---

  // --- Delete Logic ---
  const handleOpenActionMenu = (
    event: React.MouseEvent<HTMLElement>,
    item: FileItem
  ) => {
    event.stopPropagation(); // Prevent triggering navigation
    setAnchorEl(event.currentTarget);
    setCurrentItemForMenu(item);
  };

  const handleCloseActionMenu = () => {
    setAnchorEl(null);
    setCurrentItemForMenu(null);
  };

  const openDeleteConfirmation = (item: FileItem) => {
    handleCloseActionMenu();
    setDeleteConfirmItem(item);
  };

  const closeDeleteConfirmation = () => {
    setDeleteConfirmItem(null);
  };

  const handleDeleteSubmit = async () => {
    if (!deleteConfirmItem) return;

    setIsLoading(true); // Use main loading indicator
    setError(null);
    setSuccessMessage(null);

    const itemToDelete = deleteConfirmItem;
    // Encode the file path to handle special characters in URL path segments
    // Note: We assume file_path does NOT start with '/' and is relative
    const encodedFileKey = encodeURIComponent(itemToDelete.file_path);
    const apiPath = `/files/${encodedFileKey}`; // Construct the path

    try {
      console.log(
        `Attempting to delete item: ${itemToDelete.file_path} at API path: ${apiPath}`
      );
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Authentication session invalid");

      // Use del function from @aws-amplify/api/rest
      const response = await del({
        apiName: API_NAME,
        path: apiPath,
        options: {
          headers: { Authorization: idToken },
        },
      }).response;

      if (response.statusCode === 204) {
        console.log("Item deleted successfully:", itemToDelete.file_path);
        setSuccessMessage(`"${itemToDelete.filename}" deleted successfully.`);
        closeDeleteConfirmation();
        loadFiles(); // Refresh the list
      } else {
        // If status code is not 204, treat it as an error.
        // We won't try to parse the body here, rely on the catch block.
        throw new Error(`Failed with status: ${response.statusCode}`);
      }
    } catch (err: any) {
      console.error("Error deleting item:", err);
      // Amplify might wrap the error, try to extract a useful message
      const errorMessage =
        err.message ||
        (err.response ? JSON.stringify(err.response) : "Please try again.");
      setError(`Failed to delete "${itemToDelete.filename}": ${errorMessage}`);
    } finally {
      setIsLoading(false);
      closeDeleteConfirmation(); // Ensure dialog closes even on error
    }
  };
  // --- End Delete Logic ---

  // --- Download Logic ---
  const handleDownload = async (item: FileItem) => {
    handleCloseActionMenu(); // Close the menu first
    if (!item || item.is_folder) {
      console.error("Cannot download a folder or invalid item.");
      setError("Cannot download a folder.");
      return;
    }

    setError(null); // Clear previous errors
    setSuccessMessage(null); // Clear previous success messages
    // Indicate loading specifically for download? Maybe reuse main isLoading for simplicity?
    // setIsLoading(true); // Option 1: Use main loader

    console.log(
      `Initiating download for: ${item.filename} (${item.file_path})`
    );

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Authentication session invalid");

      // Encode the file path for the URL
      // file_path should be relative, e.g., "folder/file.txt"
      const encodedFileKey = encodeURIComponent(item.file_path);
      const apiPath = `/files/download/${encodedFileKey}`;

      console.log(`Requesting download URL from API: ${apiPath}`);

      // Use the Amplify API category 'get' to call the endpoint
      const restOperation = get({
        apiName: API_NAME,
        path: apiPath,
        options: {
          headers: { Authorization: idToken },
        },
      });

      const response = await restOperation.response;
      // Only process body if status code is OK
      if (response.statusCode === 200) {
        const body = await response.body.json();
        // Add runtime check for safety, then assert type
        if (
          body &&
          typeof body === "object" &&
          "downloadUrl" in body &&
          typeof body.downloadUrl === "string"
        ) {
          // Use intermediate 'unknown' type assertion
          const { downloadUrl } = body as unknown as GetDownloadUrlResponse;
          console.log("Received download URL.");

          // Trigger the download in the browser
          const link = document.createElement("a");
          link.href = downloadUrl; // Use the typed variable
          // Backend sets Content-Disposition
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link); // Clean up
          console.log(`Download triggered for ${item.filename}`);
          setSuccessMessage(`Download started for "${item.filename}".`);
        } else {
          // Handle cases where status is 200 but body is unexpected
          console.error("Received status 200 but invalid body format:", body);
          throw new Error("Received invalid response from server.");
        }
      } else {
        // Handle non-200 status codes
        let errorBody: ErrorResponse | null = null;
        try {
          // Use intermediate 'unknown' type assertion
          errorBody = (await response.body.json()) as unknown as ErrorResponse;
        } catch (parseError) {
          // Ignore if body isn't valid JSON
          console.warn("Could not parse error response body");
        }
        throw new Error(
          errorBody?.message ||
            `Failed to get download URL (Status: ${response.statusCode})`
        );
      }
    } catch (err: any) {
      console.error("Download failed:", err);
      setError(
        `Download failed for "${item.filename}": ${
          err.message || "Please try again."
        }`
      );
    } finally {
      // setIsLoading(false); // Stop loading indicator if used
    }
  };
  // --- End Download Logic ---

  // --- Upload Logic ---
  const handleUploadButtonClick = (): void => {
    fileInputRef.current?.click(); // Trigger hidden file input
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log(
        "File selected:",
        file.name,
        file.type || "unknown",
        file.size
      );
      uploadFile(file);
      // Clear the input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);
    const filePath =
      currentPath === "/" ? file.name : `${currentPath}${file.name}`;
    const fileType = file.type || "application/octet-stream"; // Default if browser doesn't know

    try {
      // 1. Get pre-signed URL
      console.log(`Requesting upload URL for: ${filePath}`);
      const session = await fetchAuthSession(); // Need token for this call too
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Authentication session invalid");

      const urlResponse = await post({
        apiName: API_NAME,
        path: "/files/upload-url",
        options: {
          body: {
            filename: filePath,
            contentType: fileType,
          },
          headers: { Authorization: idToken },
        },
      }).response;

      // Use safer type assertion via unknown
      const { uploadUrl, key } = (await urlResponse.body.json()) as unknown as {
        uploadUrl: string;
        key: string;
      };

      if (!uploadUrl || !key)
        throw new Error("Could not get upload URL from backend.");
      console.log(`Got upload URL for key: ${key}`);

      // 2. Upload file directly to S3
      console.log(`Uploading ${file.name} (${fileType}) to S3...`);
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": fileType,
        },
      });

      if (!uploadResponse.ok) {
        // Attempt to get error details from S3 response if possible
        const errorText = await uploadResponse.text();
        console.error("S3 upload failed response:", errorText);
        throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
      }
      console.log(`${file.name} uploaded successfully.`);
      setSuccessMessage(`${file.name} uploaded successfully!`);

      // 3. Refresh file list after a short delay
      setTimeout(() => {
        loadFiles(); // Now calls the memoized function correctly
      }, 2500);
    } catch (err: any) {
      console.error("Upload failed:", err);
      setError(`Upload failed: ${err.message || "Please try again."}`);
    } finally {
      setIsUploading(false);
    }
  };
  // --- End Upload Logic ---

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top App Bar */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            S3 File Manager
          </Typography>
          <Typography sx={{ mr: 2 }}>
            {/* Using 'any' for user type for now */}
            Welcome, {user?.signInDetails?.loginId || user?.username || "User"}!
          </Typography>
          <Button color="inherit" onClick={handleSignOut}>
            Sign Out
          </Button>
        </Toolbar>
      </AppBar>

      {/* Main Content Area */}
      <Container maxWidth="lg" sx={{ mt: 2, flexGrow: 1 }}>
        {/* Toolbar for actions and path */}
        <Toolbar disableGutters sx={{ mb: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Breadcrumbs aria-label="breadcrumb">
              {generateBreadcrumbs(currentPath, handleNavigatePath)}
            </Breadcrumbs>
          </Box>
          {currentPath !== "/" && (
            <IconButton onClick={handleNavigateUp} title="Go Up">
              <ArrowUpwardIcon />
            </IconButton>
          )}
          <Button
            startIcon={<CreateNewFolderIcon />}
            onClick={openCreateFolderModal}
            sx={{ ml: 1 }}
          >
            Create Folder
          </Button>
          <Button
            startIcon={<CloudUploadIcon />}
            onClick={handleUploadButtonClick}
            disabled={isUploading}
            sx={{ ml: 1 }}
          >
            {isUploading ? "Uploading..." : "Upload File"}
          </Button>
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            style={{ display: "none" }}
          />
        </Toolbar>

        {/* File/Folder List */}
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {!isLoading && !error && (
          <List>
            {Array.isArray(files) &&
              files.map((item: FileItem) => (
                <ListItem
                  key={item.file_path}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="actions"
                      onClick={(e) => handleOpenActionMenu(e, item)}
                      // Prevent click propagating to ListItemButton
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => handleNavigate(item)}>
                    <ListItemIcon>
                      {item.is_folder ? <FolderIcon /> : <FileIcon />}
                    </ListItemIcon>
                    <ListItemText primary={item.filename} />
                    {/* TODO: Add secondary text (size, date), actions (delete) */}
                  </ListItemButton>
                </ListItem>
              ))}
            {Array.isArray(files) && !files.length && (
              <ListItem>
                <ListItemText primary="This folder is empty." />
              </ListItem>
            )}
          </List>
        )}
      </Container>
      {/* Feedback Snackbar */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
      <Snackbar
        open={!!error} // Show snackbar if error is not null
        autoHideDuration={6000}
        onClose={() => setError(null)} // Clear error on close
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {/* Wrap Alert in Snackbar for proper styling */}
        <Alert
          onClose={() => setError(null)}
          severity="error"
          sx={{ width: "100%" }}
        >
          {error}
        </Alert>
      </Snackbar>
      <Dialog
        open={isCreateFolderModalOpen}
        onClose={closeCreateFolderModal}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{"Create New Folder"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the name of the new folder:
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="name"
            label="Folder Name"
            type="text"
            fullWidth
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateFolderModal}>Cancel</Button>
          <Button onClick={handleCreateFolderSubmit} autoFocus>
            Create
          </Button>
        </DialogActions>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmItem} // Open if deleteConfirmItem is not null
        onClose={closeDeleteConfirmation}
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
      >
        <DialogTitle id="delete-confirm-title">
          {`Delete ${deleteConfirmItem?.is_folder ? "Folder" : "File"}?`}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-confirm-description">
            Are you sure you want to delete "{deleteConfirmItem?.filename}"?
            {deleteConfirmItem?.is_folder && (
              <Typography
                variant="caption"
                display="block"
                color="error"
                sx={{ mt: 1 }}
              >
                Note: Folder deletion is not yet supported.
              </Typography>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteConfirmation}>Cancel</Button>
          <Button
            onClick={handleDeleteSubmit}
            color="error"
            // Disable if it's a folder, as deletion isn't supported
            disabled={isLoading || deleteConfirmItem?.is_folder}
            autoFocus
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      {/* Item Action Menu */}
      <Menu
        id="item-action-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseActionMenu}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        {/* Add other actions like Rename, Download later */}
        <MenuItem
          onClick={() => openDeleteConfirmation(currentItemForMenu!)}
          disabled={currentItemForMenu?.is_folder}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
        {/* Add Download action */}
        <MenuItem
          onClick={() => handleDownload(currentItemForMenu!)}
          disabled={currentItemForMenu?.is_folder} // Disable for folders
        >
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
        {/* Add more menu items here */}
      </Menu>
    </Box>
  );
};

export default FileManager;
