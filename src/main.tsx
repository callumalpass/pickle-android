import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/azeret-mono/500.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import "./styles.css";
import { applyStoredTheme } from "./ui/theme";

applyStoredTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
