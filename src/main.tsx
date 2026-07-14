import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/inter";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL no está configurada.");
}

const convex = new ConvexReactClient(convexUrl);
const root = document.getElementById("root");

if (!root) throw new Error("No se encontró el contenedor de la aplicación.");

createRoot(root).render(
  <ConvexAuthProvider client={convex}>
    <App />
  </ConvexAuthProvider>,
);
