import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProvider } from "./context/AppContext";
import { AppMenuProvider } from "./context/AppMenuContext";
import { applyTheme } from "./lib/userPreferences";

applyTheme();
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <AppMenuProvider>
        <App />
      </AppMenuProvider>
    </AppProvider>
  </StrictMode>
);
