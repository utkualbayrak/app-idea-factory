import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserNamesProvider } from "@/lib/user-names";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <UserNamesProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UserNamesProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
