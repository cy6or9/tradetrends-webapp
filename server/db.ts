import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Get DATABASE_URL or gracefully handle missing in development
const DATABASE_URL = process.env.DATABASE_URL;

// In production environment, DATABASE_URL is required
if (!DATABASE_URL) {
  if (process.env.NODE_ENV === 'production') {
    console.error("DATABASE_URL is not set in production environment!");
    throw new Error("DATABASE_URL environment variable is required in production. Please set it in the Secrets tab in the Deployment configuration.");
  } else {
    console.warn("DATABASE_URL is not set, using placeholder for development only");
  }
}

// Create pool only if we have a DATABASE_URL
export const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;
export const db = drizzle({ client: pool, schema });
