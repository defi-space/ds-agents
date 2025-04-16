import type { MemoryStore } from "@daydreamsai/core";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Configuration for the Supabase memory store
 */
export interface SupabaseMemoryStoreConfig {
  /** Supabase URL */
  url: string;
  /** Supabase API key */
  key: string;
  /** Table name for storing memory data */
  tableName?: string;
  /** Timeout for database operations in milliseconds (default: 60000ms) */
  timeout?: number;
}

/**
 * Creates a Supabase-backed implementation of the MemoryStore interface
 *
 * @param config - Configuration for the Supabase memory store
 * @returns A MemoryStore implementation using Supabase
 */
export function createSupabaseMemoryStore(
  config: SupabaseMemoryStoreConfig
): MemoryStore {
  const { url, key, tableName = "memory", timeout = 60000 } = config;

  // Create Supabase client with default options
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
    },
    // Default timeout is 6 seconds in Supabase JS Client v2
    // We're not setting custom fetch here due to type incompatibilities
  });

  // Initialize the table if it doesn't exist
  initializeTable(client, tableName).catch(console.error);

  return {
    /**
     * Retrieves data from the Supabase memory store
     * @param key - Key to look up
     * @returns The stored value or null if not found
     */
    async get<T>(key: string): Promise<T | null> {
      const { data, error } = await client
        .from(tableName)
        .select("value")
        .eq("key", key)
        .single();

      if (error || !data) {
        return null;
      }

      try {
        return JSON.parse(data.value) as T;
      } catch (e) {
        console.error(`Error parsing data for key ${key}:`, e);
        return null;
      }
    },

    /**
     * Stores data in the Supabase memory store
     * @param key - Key to store under
     * @param value - Value to store
     */
    async set<T>(key: string, value: T): Promise<void> {
      try {
        const serializedValue = JSON.stringify(value);
        
        // Removed the .select() call which was causing an unnecessary database roundtrip
        const { error } = await client
          .from(tableName)
          .upsert({
            key,
            value: serializedValue,
            updated_at: new Date().toISOString(),
          });

        if (error) {
          if (error.message.includes("timeout") || error.message.includes("statement timeout")) {
            console.warn(`Timeout when setting value for key ${key}, but operation may have succeeded`);
            // Operation might have succeeded despite the timeout
            return;
          }
          throw new Error(`Failed to set value for key ${key}: ${error.message}`);
        }
      } catch (e) {
        console.error(`Error in memory store set operation for key ${key}:`, e);
        // If it's a timeout error, we'll assume it might have succeeded
        if (e instanceof Error && 
            (e.message.includes("timeout") || e.message.includes("statement timeout"))) {
          console.warn(`Timeout when setting value for key ${key}, but operation may have succeeded`);
          return;
        }
        throw e;
      }
    },

    /**
     * Removes a specific entry from the Supabase memory store
     * @param key - Key to remove
     */
    async delete(key: string): Promise<void> {
      const { error } = await client.from(tableName).delete().eq("key", key);

      if (error) {
        throw new Error(`Failed to delete key ${key}: ${error.message}`);
      }
    },

    /**
     * Removes all entries from the Supabase memory store
     */
    async clear(): Promise<void> {
      const { error } = await client.from(tableName).delete().neq("key", ""); // Delete all rows

      if (error) {
        throw new Error(`Failed to clear memory store: ${error.message}`);
      }
    },
  };
}

/**
 * Initialize the memory table in Supabase
 *
 * @param client - Supabase client
 * @param tableName - Name of the table to create
 */
async function initializeTable(
  client: SupabaseClient,
  tableName: string
): Promise<void> {
  // Check if the table exists by querying it
  const { error } = await client.from(tableName).select("key").limit(1);

  // If the table doesn't exist, create it
  if (error && error.code === "42P01") {
    // PostgreSQL code for undefined_table
    // We need to use raw SQL to create the table
    // This requires the execute_sql function to be available in the database
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    try {
      await client.rpc("execute_sql", { query: createTableQuery });
      console.log(`Created memory table: ${tableName}`);
    } catch (e) {
      console.error(`Failed to create memory table ${tableName}:`, e);
      throw e;
    }
  } else if (error) {
    console.error(`Error checking memory table ${tableName}:`, error);
  }
}

/**
 * Factory function to create a MemoryStore implementation using Supabase
 *
 * @param url - Supabase URL
 * @param key - Supabase API key
 * @param tableName - Name of the table to store memory data
 * @param timeout - Optional timeout for database operations in milliseconds
 * @returns A MemoryStore implementation
 */
export function createSupabaseMemory(
  url: string,
  key: string,
  tableName: string = "memory",
  timeout: number = 60000
): MemoryStore {
  return createSupabaseMemoryStore({
    url,
    key,
    tableName,
    timeout,
  });
}
