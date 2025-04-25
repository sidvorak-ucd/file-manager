import React from "react";
import { Amplify } from "aws-amplify";
import {
  Authenticator,
  ThemeProvider as AmplifyThemeProvider,
  defaultTheme as amplifyDefaultTheme,
} from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css"; // Default Amplify UI styles

// Material-UI Imports
import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
} from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import awsExports from "./aws-exports"; // Your Amplify config file
import FileManager from "./components/FileManager.tsx"; // Changed import extension

// Configure Amplify
Amplify.configure(awsExports);

// Material-UI Theme (can customize later)
const muiTheme = createTheme({
  // You can customize MUI theme here
  // palette: {
  //   primary: { main: '#1976d2' },
  // },
});

// Optional: Amplify Theme (can customize later)
const amplifyTheme = {
  name: "s3-manager-theme",
  tokens: {
    // Example: Customize colors, fonts, etc.
    // colors: {
    //   brand: {
    //     primary: { value: '#005a9c' }, // Example primary color
    //   },
    // },
  },
};

function App() {
  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline /> {/* Apply MUI baseline styles */}
      <AmplifyThemeProvider theme={amplifyTheme}>
        <Authenticator loginMechanisms={["email"]} variation="modal">
          {({ signOut, user }) => (
            <main>
              {/* Pass user and signOut to your main application component */}
              <FileManager user={user} signOut={signOut} />
            </main>
          )}
        </Authenticator>
      </AmplifyThemeProvider>
    </MuiThemeProvider>
  );
}

export default App;
