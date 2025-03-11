import path from "path";
import fs from "fs";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, log, serveStatic } from "./vite";

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
    // Use NODE_ENV from environment or default to development
    process.env.NODE_ENV = process.env.NODE_ENV || 'development';
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

    // Set up Vite in development mode or serve static files in production
    if (app.get("env") === "development") {
      log('Setting up Vite...', 'server');
      await setupVite(app, server);
      log('Vite setup completed', 'server');
    } else {
      const publicDir = path.resolve(__dirname, "public");
      log(`Serving static files from: ${publicDir}`, 'server');

      // Verify the public directory exists
      if (!fs.existsSync(publicDir)) {
        throw new Error(`Public directory not found: ${publicDir}`);
      }

      // Serve static files
      app.use(express.static(publicDir));

      // Serve index.html for all routes (client-side routing)
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          const indexPath = path.join(publicDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            log(`Index file not found at: ${indexPath}`, 'error');
            res.status(404).send('Not found');
          }
        }
      });

      log('Static file serving configured', 'server');
    }

    // Listen on port 5000
    const port = process.env.PORT || 5000;
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

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log(`Uncaught exception: ${error.message}`, 'error');
      console.error('Uncaught exception:', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
      console.error('Unhandled Rejection:', reason);
    });

  } catch (error) {
    log(`Failed to start server: ${error}`, 'error');
    console.error('Server startup error:', error);
    process.exit(1);
  }
})();