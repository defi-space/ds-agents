import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { MemoryStore } from "@daydreamsai/core";

export interface SupabaseMemoryOptions {
  /**
   * Supabase project URL
   */
  url: string;
  /**
   * Supabase API key
   */
  apiKey: string;
  /**
   * Custom name for the Supabase table
   * @default "conversations"
   */
  tableName?: string;
}

export class SupabaseMemoryStore implements MemoryStore {
  private client: SupabaseClient;
  private readonly tableName: string;

  constructor(options: SupabaseMemoryOptions) {
    // Sanitize table name to make it PostgreSQL compatible
    const rawTableName = options.tableName || "conversations";
    this.tableName = this.sanitizeTableName(rawTableName);
    
    this.client = createClient(options.url, options.apiKey);
  }

  /**
   * Sanitize table name to make it PostgreSQL compatible
   * @param name - Original table name
   * @returns Sanitized table name
   */
  private sanitizeTableName(name: string): string {
    // Replace non-alphanumeric characters with underscores
    const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure the name starts with a letter or underscore
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      return `t_${sanitized}`;
    }
    
    return sanitized;
  }

  /**
   * Handle BigInt serialization by converting to a special format
   * @param value - Value to serialize
   * @returns Serializable value
   */
  private serializeBigInt<T>(value: T): any {
    return JSON.parse(JSON.stringify(value, (_, v) => 
      typeof v === 'bigint' ? { __type: 'bigint', value: v.toString() } : v
    ));
  }

  /**
   * Handle BigInt deserialization by converting from special format
   * @param value - Value to deserialize
   * @returns Deserialized value
   */
  private deserializeBigInt<T>(value: any): T {
    if (!value) return value as T;
    
    return JSON.parse(JSON.stringify(value), (_, v) => 
      v && typeof v === 'object' && v.__type === 'bigint' 
        ? BigInt(v.value) 
        : v
    ) as T;
  }

  /**
   * Initialize the Supabase connection and ensure the table exists
   */
  async initialize(): Promise<void> {
    try {
      // Test the connection with a simple query
      const { data, error } = await this.client
        .from(this.tableName)
        .select('key')
        .limit(1);

      if (error) {
        // Some other error occurred when trying to access the table
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieves a value from the store
   * @param key - Key to look up
   * @returns The stored value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('value')
      .eq('key', key)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Record not found error code
        return null;
      }
      throw error;
    }
    
    return this.deserializeBigInt<T>(data?.value) || null;
  }

  /**
   * Stores a value in the store
   * @param key - Key to store under
   * @param value - Value to store
   */
  async set<T>(key: string, value: T): Promise<void> {
    const serializedValue = this.serializeBigInt(value);
    
    const { error } = await this.client
      .from(this.tableName)
      .upsert(
        { 
          key, 
          value: serializedValue, 
          updated_at: new Date().toISOString() 
        },
        { 
          onConflict: 'key',
          ignoreDuplicates: false
        }
      );
    
    if (error) {
      throw error;
    }
  }

  /**
   * Removes a specific entry from the store
   * @param key - Key to remove
   */
  async delete(key: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('key', key);
    
    if (error) {
      throw error;
    }
  }

  /**
   * Removes all entries from the store
   */
  async clear(): Promise<void> {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .neq('key', '__dummy_nonexistent_key__'); // Delete all rows
    
    if (error) {
      throw error;
    }
  }
}

/**
 * Creates a new Supabase-backed memory store
 * @param options - Supabase connection options
 * @returns A MemoryStore implementation using Supabase for storage
 */
export async function createSupabaseMemoryStore(
  options: SupabaseMemoryOptions
): Promise<MemoryStore> {
  const store = new SupabaseMemoryStore(options);
  await store.initialize();
  return store;
} 