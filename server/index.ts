import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Capture JSON responses for logging
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  // Log request details on completion
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

    // Log Vite/Vue related requests for debugging
    if (path.includes('__vite') || path.includes('.vue') || path.includes('.js') || path.includes('.ts')) {
      log(`Vite request: ${logLine}`, 'vite');
    }

    // Log API responses
    if (path.startsWith("/api")) {
      let apiLog = logLine;
      if (capturedJsonResponse) {
        apiLog += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (apiLog.length > 80) {
        apiLog = apiLog.slice(0, 79) + "…";
      }
      log(apiLog, 'api');
    }
  });

  next();
});

(async () => {
  // Set development mode explicitly
  process.env.NODE_ENV = 'development';

  const server = await registerRoutes(app);

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    log(`Error: ${message}`, 'error');
    res.status(status).json({ message });
    console.error(err);
  });

  // Set up Vite in development mode
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Listen on port 5000
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`Server running at http://0.0.0.0:${port}`);
  });
})();