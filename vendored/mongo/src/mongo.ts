import { Collection, MongoClient, ObjectId } from "mongodb";
import type { Filter, Document } from "mongodb";
import type { MemoryStore } from "@daydreamsai/core";

export interface MongoMemoryOptions {
  uri: string;
  dbName?: string;
  collectionName?: string;
}

export class MongoMemoryStore implements MemoryStore {
  private client: MongoClient;
  private collection: Collection | null = null;
  private readonly dbName: string;
  private readonly collectionName: string;

  constructor(options: MongoMemoryOptions) {
    // Sanitize the URI to ensure it doesn't contain quotes
    let sanitizedUri = options.uri.replace(/["']/g, '');
    
    // Ensure URI includes required parameters for Atlas connection
    if (sanitizedUri.includes('mongodb+srv') && !sanitizedUri.includes('retryWrites=')) {
      sanitizedUri += (sanitizedUri.includes('?') ? '&' : '?') + 'retryWrites=true&w=majority';
    }
    
    // Configure the MongoClient with options for Phala environment
    // Based on https://www.mongodb.com/docs/drivers/node/v3.6/fundamentals/connection/connection-options
    const clientOptions = {
      // Connection management
      connectTimeoutMS: 60000,           // Increased from default 30000
      socketTimeoutMS: 120000,           // Increased from default 360000
      serverSelectionTimeoutMS: 60000,   // Increased for Phala environment
      maxIdleTimeMS: 120000,             // Close idle connections after 2 minutes
      waitQueueTimeoutMS: 30000,         // Wait up to 30s for a connection
      
      // TLS settings
      tls: true,                         // Use TLS for Atlas
      tlsInsecure: true,                 // Required for Phala environment
      
      // Application identification
      appName: "ds-agents-cluster"
    };
    
    console.log(`Connecting to MongoDB with URI: ${sanitizedUri.replace(/\/\/([^:]+):[^@]+@/, '//****:****@')}`);
    
    this.client = new MongoClient(sanitizedUri, clientOptions);
    this.dbName = options.dbName || "dreams_memory";
    this.collectionName = options.collectionName || "conversations";
  }

  /**
   * Initialize the MongoDB connection
   */
  async initialize(): Promise<void> {
    try {
      console.log(`Attempting to connect to MongoDB database: ${this.dbName}, collection: ${this.collectionName}...`);
      await this.client.connect();
      
      const db = this.client.db(this.dbName);
      this.collection = db.collection(this.collectionName);
      console.log(`Collection ${this.collectionName} accessed successfully`);
    } catch (error) {
      // More detailed error logging
      console.error(`MongoDB Atlas connection error: ${error}`);
      throw error;
    }
  }

  /**
   * Converts a string key to a valid MongoDB query filter
   * @param key - The key to convert
   * @returns MongoDB filter for querying by ID
   */
  private getKeyFilter(key: string): Filter<Document> {
    // Check if the key is already a valid ObjectId
    if (ObjectId.isValid(key)) {
      try {
        return { _id: new ObjectId(key) };
      } catch (e) {
        // Fall through to use string
      }
    }
    
    // Use the key as a string directly
    return { _id: key as any };
  }

  /**
   * Retrieves a value from the store
   * @param key - Key to look up
   * @returns The stored value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.collection) throw new Error("MongoDB not initialized");

    const filter = this.getKeyFilter(key);
    const doc = await this.collection.findOne(filter);
    if (!doc) return null;

    return doc.value as T;
  }

  /**
   * Stores a value in the store
   * @param key - Key to store under
   * @param value - Value to store
   */
  async set(key: string, value: any): Promise<void> {
    if (!this.collection) throw new Error("MongoDB not initialized");

    const filter = this.getKeyFilter(key);
    await this.collection.updateOne(
      filter,
      { $set: { value } },
      { upsert: true }
    );
  }

  /**
   * Removes a specific entry from the store
   * @param key - Key to remove
   */
  async delete(key: string): Promise<void> {
    if (!this.collection) throw new Error("MongoDB not initialized");

    const filter = this.getKeyFilter(key);
    await this.collection.deleteOne(filter);
  }

  /**
   * Removes all entries from the store
   */
  async clear(): Promise<void> {
    if (!this.collection) throw new Error("MongoDB not initialized");

    await this.collection.deleteMany({});
  }

  /**
   * Close the MongoDB connection
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}

/**
 * Creates a new MongoDB-backed memory store
 * @param options - MongoDB connection options
 * @returns A MemoryStore implementation using MongoDB for storage
 */
export async function createMongoMemoryStore(
  options: MongoMemoryOptions
): Promise<MemoryStore> {
  const store = new MongoMemoryStore(options);
  await store.initialize();
  return store;
}
