import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./context/AppContext";
import { AppMenuProvider } from "./context/AppMenuContext";
import { applyTheme } from "./lib/userPreferences";

applyTheme();
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <AppMenuProvider>
          <App />
        </AppMenuProvider>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);
