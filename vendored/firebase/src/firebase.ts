import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import type { MemoryStore } from "@daydreamsai/core";

export interface FirebaseMemoryOptions {
  /**
   * Firebase project configuration
   * Either provide a service account JSON or use environment variables with firebase-admin
   */
  serviceAccount?: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
  /**
   * Custom name for the Firestore collection
   * @default "conversations"
   */
  collectionName?: string;
}

export class FirebaseMemoryStore implements MemoryStore {
  private app: App;
  private db: Firestore;
  private readonly collectionName: string;

  constructor(options: FirebaseMemoryOptions) {
    this.collectionName = options.collectionName || "conversations";
    
    // Check if Firebase app is already initialized
    const apps = getApps();
    if (apps.length === 0) {
      // Initialize Firebase app if not already initialized
      if (options.serviceAccount) {
        this.app = initializeApp({
          credential: cert({
            projectId: options.serviceAccount.projectId,
            clientEmail: options.serviceAccount.clientEmail,
            privateKey: options.serviceAccount.privateKey,
          }),
        });
      } else {
        // Use environment variables for initialization
        this.app = initializeApp();
      }
    } else {
      this.app = apps[0];
    }
    
    // Initialize Firestore
    this.db = getFirestore(this.app);
  }

  /**
   * Initialize the Firestore connection
   */
  async initialize(): Promise<void> {
    // Make a simple connection test
    try {
      await this.db.collection(this.collectionName).limit(1).get();
    } catch (error) {
      console.error(`Firestore connection error: ${error}`);
      throw error;
    }
  }

  /**
   * Retrieves a value from the store
   * @param key - Key to look up
   * @returns The stored value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    const docRef = this.db.collection(this.collectionName).doc(key);
    const doc = await docRef.get();
    
    if (!doc.exists) return null;
    
    const data = doc.data();
    return data?.value as T || null;
  }

  /**
   * Stores a value in the store
   * @param key - Key to store under
   * @param value - Value to store
   */
  async set<T>(key: string, value: T): Promise<void> {
    const docRef = this.db.collection(this.collectionName).doc(key);
    await docRef.set({ value, updatedAt: new Date() }, { merge: true });
  }

  /**
   * Removes a specific entry from the store
   * @param key - Key to remove
   */
  async delete(key: string): Promise<void> {
    const docRef = this.db.collection(this.collectionName).doc(key);
    await docRef.delete();
  }

  /**
   * Removes all entries from the store
   */
  async clear(): Promise<void> {
    const batch = this.db.batch();
    const snapshot = await this.db.collection(this.collectionName).get();
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  }
}

/**
 * Creates a new Firebase-backed memory store
 * @param options - Firebase connection options
 * @returns A MemoryStore implementation using Firebase Firestore for storage
 */
export async function createFirebaseMemoryStore(
  options: FirebaseMemoryOptions
): Promise<MemoryStore> {
  const store = new FirebaseMemoryStore(options);
  await store.initialize();
  return store;
} 