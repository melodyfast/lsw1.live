import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => {
  const port = parseInt(process.env.PORT || "8080", 10);
  
  return {
    server: {
      host: "0.0.0.0",
      port: port,
      strictPort: true,
    },
    preview: {
      host: "0.0.0.0",
      port: port,
      strictPort: true,
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
