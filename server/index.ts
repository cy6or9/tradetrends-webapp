import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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

    if (path.startsWith("/api") || path === "/health") {
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
  try {
    // Set development mode explicitly
    process.env.NODE_ENV = 'development';
    log('Starting server initialization...', 'server');

    const server = await registerRoutes(app);
    log('Routes registered successfully', 'server');

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
      log('Setting up Vite...', 'server');
      await setupVite(app, server);
      log('Vite setup completed', 'server');
    }

    // Listen on port 5000
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server running at http://0.0.0.0:${port}`, 'server');
    });

    // Log any unhandled errors
    server.on('error', (error: any) => {
      log(`Server error: ${error.message}`, 'error');
      if (error.code === 'EADDRINUSE') {
        log(`Port ${port} is already in use`, 'error');
      }
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      log('SIGTERM received. Shutting down gracefully...', 'server');
      server.close(() => {
        log('Server closed', 'server');
        process.exit(0);
      });
    });

  } catch (error) {
    log(`Failed to start server: ${error}`, 'error');
    console.error('Server startup error:', error);
    process.exit(1);
  }
})();