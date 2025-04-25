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
  /** Whether to log detailed operations */
  verbose?: boolean;
}

/**
 * Enhanced function to initialize tables with multiple fallback strategies
 * @param client - Supabase client
 * @param tableName - Name of the table to initialize
 * @param verbose - Whether to log detailed operations
 * @returns Promise resolving to boolean indicating success
 */
async function ensureTableExists(
  client: SupabaseClient,
  tableName: string,
  verbose: boolean = false
): Promise<boolean> {
  const log = (message: string) => {
    if (verbose) {
      console.log(`[Supabase:${tableName}] ${message}`);
    }
  };
  
  log(`Ensuring table exists...`);
  
  // First check if the table exists by querying it
  try {
    log(`Checking if table already exists...`);
    const { data, error } = await client.from(tableName).select('key').limit(1);
    
    if (error) {
      log(`Error querying table: ${error.message}, code: ${error.code}`);
      
      // PostgreSQL code 42P01 means the relation/table doesn't exist
      if (error.code === "42P01") {
        log(`Table doesn't exist. Will create it.`);
      } else {
        log(`Unexpected error checking table existence: ${error.message}`);
        return false;
      }
    } else {
      log(`Table already exists!`);
      return true;
    }
  } catch (queryError) {
    log(`Exception checking table: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
  }

  // Create table using SQL
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Enable RLS on the table
    ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
    
    -- Allow all users to read from the table
    CREATE POLICY "Allow all users to read from ${tableName}" 
    ON ${tableName} 
    FOR SELECT 
    TO authenticated, anon 
    USING (true);
    
    -- Allow only service_role to insert records
    CREATE POLICY "Allow service_role to insert into ${tableName}" 
    ON ${tableName} 
    FOR INSERT 
    TO service_role 
    WITH CHECK (true);
    
    -- Allow only service_role to update records
    CREATE POLICY "Allow service_role to update ${tableName}" 
    ON ${tableName} 
    FOR UPDATE 
    TO service_role 
    WITH CHECK (true);
    
    -- Allow only service_role to delete records
    CREATE POLICY "Allow service_role to delete from ${tableName}" 
    ON ${tableName} 
    FOR DELETE 
    TO service_role 
    USING (true);
  `;
  
  log(`Attempting to create table with SQL: ${createTableQuery.trim()}`);
  
  // Try all available methods to create the table
  try {
    // Method 1: Try using the execute_sql RPC function
    log(`Method 1: Attempting via execute_sql RPC...`);
    try {
      const { error } = await client.rpc('enable_pgvector_extension');
      if (error) {
        log(`Warning: pgvector extension setup failed: ${error.message}`);
      } else {
        log(`Successfully enabled pgvector extension`);
      }
      
      // First try using the create_memory_table_with_policies function if it exists
      try {
        log(`Attempting to use create_memory_table_with_policies function...`);
        const { error: policyError } = await client.rpc('create_memory_table_with_policies', { table_name: tableName });
        if (policyError) {
          log(`Function create_memory_table_with_policies failed (might not exist): ${policyError.message}. Falling back to raw SQL.`);
        } else {
          log(`Successfully created table with policies using create_memory_table_with_policies function`);
          log(`Waiting 5 seconds for table creation to propagate...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          log(`Wait complete, table should now be available`);
          return true;
        }
      } catch (functionError) {
        log(`Exception using create_memory_table_with_policies (likely not available): ${functionError instanceof Error ? functionError.message : String(functionError)}`);
      }
      
      // Fall back to raw SQL execution
      const { error: sqlError } = await client.rpc('execute_sql', { query: createTableQuery });
      if (sqlError) {
        log(`RPC execute_sql failed: ${sqlError.message}, code: ${sqlError.code}`);
      } else {
        log(`Successfully created table using RPC execute_sql`);
        log(`Waiting 5 seconds for table creation to propagate...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        log(`Wait complete, table should now be available`);
        return true;
      }
    } catch (rpcError) {
      log(`Exception using RPC: ${rpcError instanceof Error ? rpcError.message : String(rpcError)}`);
    }
    
    // Method 2: Try direct table insert if the table might have been created by a concurrent process
    log(`Method 2: Attempting to insert a test row (in case table was created concurrently)...`);
    try {
      const testKey = `__test_key_${Date.now()}`;
      const { error } = await client.from(tableName).upsert({ 
        key: testKey, 
        value: { test: true },
        updated_at: new Date().toISOString() 
      });
      
      if (error) {
        log(`Test insert failed: ${error.message}, code: ${error.code}`);
        return false;
      } else {
        log(`Test insert succeeded, table exists!`);
        // Clean up test key
        await client.from(tableName).delete().eq('key', testKey);
        log(`Waiting 5 seconds for table operations to fully propagate...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        log(`Wait complete, table should now be available`);
        return true;
      }
    } catch (insertError) {
      log(`Exception during test insert: ${insertError instanceof Error ? insertError.message : String(insertError)}`);
    }
    
    log(`All automatic methods to create table failed.`);
    log(`Please manually run this SQL in your Supabase SQL editor:`);
    log(createTableQuery);
    
    return false;
  } catch (error) {
    log(`Unexpected error during table creation: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Handles BigInt values before JSON serialization
 * @param key - Object key
 * @param value - Value to serialize
 * @returns The serializable value
 */
function replacerForBigInt(_key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString() + 'n'; // Append 'n' to identify it as a BigInt when deserializing
  }
  return value;
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
  const { url, key, tableName = "memory", verbose = false } = config;

  // Create Supabase client
  const client = createClient(url, key);

  // Initialize the table if it doesn't exist with enhanced error handling
  ensureTableExists(client, tableName, verbose).then(success => {
    if (verbose) {
      console.log(`[Supabase:${tableName}] Table initialization ${success ? 'succeeded' : 'failed'}`);
    }
  }).catch(err => {
    console.error(`[Supabase:${tableName}] Error during table initialization:`, err);
  });

  return {
    /**
     * Retrieves data from the Supabase memory store
     * @param key - Key to look up
     * @returns The stored value or null if not found
     */
    async get<T>(key: string): Promise<T | null> {
      try {
        const { data, error } = await client
          .from(tableName)
          .select("value")
          .eq("key", key)
          .single();

        if (error || !data) {
          if (verbose && error) {
            console.error(`[Supabase:${tableName}] Error retrieving data for key ${key}:`, error);
          }
          return null;
        }

        // Convert processed BigInt strings back to actual BigInt values
        if (data.value) {
          const reviver = (_key: string, value: any) => {
            if (typeof value === 'string' && /^\d+n$/.test(value)) {
              return BigInt(value.slice(0, -1));
            }
            return value;
          };
          
          // If data.value is already processed by Supabase as an object, handle its properties
          const valueStr = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
          return JSON.parse(valueStr, reviver);
        }

        return data.value as T;
      } catch (e) {
        console.error(`[Supabase:${tableName}] Error retrieving data for key ${key}:`, e);
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
        // Process value to handle BigInt before serialization
        const processedValue = JSON.parse(JSON.stringify(value, replacerForBigInt));

        const { error } = await client
          .from(tableName)
          .upsert({
            key,
            value: processedValue,
            updated_at: new Date().toISOString(),
          });
          
        if (error) {
          throw new Error(`Supabase error: ${error.message}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        // If error suggests table doesn't exist, try to create it and retry
        if (errorMessage.includes('does not exist') || errorMessage.includes('42P01')) {
          if (verbose) {
            console.log(`[Supabase:${tableName}] Table may not exist. Attempting to create it...`);
          }
          
          const tableCreated = await ensureTableExists(client, tableName, verbose);
          
          if (tableCreated) {
            try {
              // Process value again to ensure we're using the processed value in retry
              const processedValueForRetry = JSON.parse(JSON.stringify(value, replacerForBigInt));
              
              // Retry the operation
              const { error: retryError } = await client
                .from(tableName)
                .upsert({
                  key,
                  value: processedValueForRetry,
                  updated_at: new Date().toISOString(),
                });
                
              if (retryError) {
                throw new Error(`Failed to set value after table creation: ${retryError.message}`);
              }
              return;
            } catch (retryErr) {
              const retryErrorMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
              throw new Error(`Failed to set value during retry: ${retryErrorMessage}`);
            }
          }
        }
        
        throw new Error(`Failed to set value for key ${key}: ${errorMessage}`);
      }
    },

    /**
     * Removes a specific entry from the Supabase memory store
     * @param key - Key to remove
     */
    async delete(key: string): Promise<void> {
      try {
        const { error } = await client.from(tableName).delete().eq("key", key);
        
        if (error) {
          throw new Error(`Supabase error: ${error.message}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to delete key ${key}: ${errorMessage}`);
      }
    },

    /**
     * Removes all entries from the Supabase memory store
     */
    async clear(): Promise<void> {
      try {
        const { error } = await client.from(tableName).delete().neq("key", "");
        
        if (error) {
          throw new Error(`Supabase error: ${error.message}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to clear memory store: ${errorMessage}`);
      }
    }
  };
}

/**
 * Factory function to create a MemoryStore implementation using Supabase
 *
 * @param url - Supabase URL
 * @param key - Supabase API key
 * @param tableName - Name of the table to store memory data
 * @param verbose - Whether to log detailed operations
 * @returns A MemoryStore implementation
 */
export function createSupabaseMemory(
  url: string,
  key: string,
  tableName: string = "memory",
  verbose: boolean = true
): MemoryStore {
  return createSupabaseMemoryStore({
    url,
    key,
    tableName,
    verbose
  });
}
