import { Collection, MongoClient, ObjectId, type Filter, type Document } from "mongodb";
import type { MemoryStore } from "@daydreamsai/core";
import crypto from "crypto";

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
    this.client = new MongoClient(options.uri);
    this.dbName = options.dbName || "dreams_memory";
    this.collectionName = options.collectionName || "conversations";
  }

  /**
   * Initialize the MongoDB connection
   */
  async initialize(): Promise<void> {
    await this.client.connect();
    const db = this.client.db(this.dbName);
    this.collection = db.collection(this.collectionName);
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
