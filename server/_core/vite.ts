import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

// Resolve the project root directory reliably in both dev and production bundles.
// import.meta.url / import.meta.dirname may be undefined after esbuild bundling,
// so we fall back to STATIC_DIR env var or process.cwd() as the project root.
function getProjectRoot(): string {
  // Allow explicit override via env (useful for production deployments)
  if (process.env.STATIC_DIR) {
    return process.env.STATIC_DIR;
  }
  // In development (tsx watch), __dirname-like resolution works via import.meta
  try {
    const { fileURLToPath } = require("url");
    const url = import.meta?.url;
    if (url) {
      return path.resolve(path.dirname(fileURLToPath(url)), "../..");
    }
  } catch {
    // ignore
  }
  // Fallback: assume CWD is the project root (works when started from project dir)
  return process.cwd();
}

export async function setupVite(app: Express, server: Server) {
  // Use dynamic import to avoid bundling vite.config (and its tailwindcss/vite deps)
  // into the production server bundle. This import only runs in development mode.
  const { createServer: createViteServer } = await import("vite");
  const viteConfigModule = await import(/* @vite-ignore */ "../../vite.config");
  const viteConfig = viteConfigModule.default || viteConfigModule;

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const projectRoot = getProjectRoot();
      const clientTemplate = path.resolve(projectRoot, "client", "index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      (vite as any).ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production, static files are in dist/public relative to the project root.
  // STATIC_DIR env var can override the base path for flexible deployments.
  const projectRoot = process.env.STATIC_DIR || process.cwd();
  const distPath = path.resolve(projectRoot, "dist", "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // API routes must NOT fall through to index.html
  app.use("/api/*", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });

  // fall through to index.html if the file doesn't exist (SPA routing)
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
