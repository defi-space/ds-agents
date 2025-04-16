/**
 * Imports required dependencies from chromadb and local types
 */
import {
  ChromaClient,
  Collection,
  GoogleGenerativeAiEmbeddingFunction,
  type IEmbeddingFunction,
} from "chromadb";  
// For the @daydreamsai/core import error, let's create a type alias locally
// instead of importing from @daydreamsai/core to avoid the import error
type InferContextMemory<T> = T;
interface VectorStore {
  connection?: string;
  upsert(contextId: string, data: any): Promise<void>;
  query(contextId: string, query: string): Promise<any[]>;
  createIndex(indexName: string): Promise<void>;
  deleteIndex(indexName: string): Promise<void>;
}

/**
 * Implementation of VectorStore using ChromaDB as the backend
 */
export class ChromaVectorStore implements VectorStore {
  private client: ChromaClient;
  private collection!: Collection;
  private embedder: IEmbeddingFunction;
  private isInitialized: boolean = false;

  /**
   * Creates a new ChromaVectorStore instance
   * @param collectionName - Name of the ChromaDB collection to use (defaults to "default")
   * @param connection - Optional connection string for ChromaDB
   * @param embedder - Optional custom embedding function implementation
   */
  constructor(
    collectionName: string = "default",
    connection?: string,
    embedder?: IEmbeddingFunction
  ) {
    // If no custom embedder is provided, create one using the agent-specific API key
    if (!embedder) {
      // Get the current agent ID (e.g., "agent-1", "agent-2", etc.)
      const agentId = process.env.CURRENT_AGENT_ID || "default-agent";
      
      // Extract the agent number from the agent ID
      // Handle different formats: "agent-1", "agent1", or just "1"
      const agentNumber = agentId.match(/\d+/)?.[0] || "";
      
      // Construct the environment variable name for the agent's API key
      // e.g., AGENT1_API_KEY for agent-1
      const apiKeyEnvVar = agentNumber ? `AGENT${agentNumber}_API_KEY` : "GOOGLE_API_KEY";
      
      // Get the API key from environment variable
      let apiKey = process.env[apiKeyEnvVar];
      
      // Parse out quotes if present
      if (apiKey) {
        apiKey = apiKey.replace(/^["'](.*)["']$/, '$1').trim();
      } else {
        // Fall back to default key
        apiKey = process.env.GOOGLE_API_KEY;
        if (apiKey) {
          apiKey = apiKey.replace(/^["'](.*)["']$/, '$1').trim();
        }
      }
      
      if (!apiKey) {
        throw new Error(`No Google API key found for agent ${agentId}`);
      }
      
      try {
        this.embedder = new GoogleGenerativeAiEmbeddingFunction({
          googleApiKey: apiKey,
          model: "text-embedding-004",
          apiKeyEnvVar: "GOOGLE_API_KEY",
        });
      } catch (error) {
        // Log the specific error during embedding function creation
        console.error(`Error creating embedding function for agent ${agentId}:`, error);
        throw new Error(`Failed to initialize GoogleGenerativeAiEmbeddingFunction: ${error}`);
      }
    } else {
      this.embedder = embedder;
    }

    const connectionUrl = connection || "http://localhost:8000";
    
    this.client = new ChromaClient({
      path: connectionUrl,
    });

    this.initCollection(collectionName).catch(error => {
      // Log the specific error during constructor's initCollection call
      console.error(`Failed to initialize collection '${collectionName}' in constructor:`, error);
      // No need to throw again, let the original throw from initCollection propagate if needed
      // throw error; // Removed redundant throw
    });
  }

  /**
   * Initializes or retrieves the ChromaDB collection
   * @param collectionName - Name of the collection to initialize
   */
  private async initCollection(collectionName: string) {
    try {
      let existingCollection = false;
      
      try {
        // Try to get the collection if it exists
        this.collection = await this.client.getCollection({
          name: collectionName,
          embeddingFunction: this.embedder,
        });
        existingCollection = true;
      } catch (error) {
        // Collection doesn't exist, create it
        this.collection = await this.client.createCollection({
          name: collectionName,
          embeddingFunction: this.embedder,
          metadata: {
            description: "Memory storage for AI consciousness",
          },
        });
      }

      this.isInitialized = true;
    } catch (error) {
      // Log the specific error during collection initialization
      console.error(`Failed to initialize collection '${collectionName}':`, error);
      this.isInitialized = false;
      throw error; // Re-throw the error after logging
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized || !this.collection) {
      throw new Error("ChromaVectorStore not properly initialized");
    }
  }

  /**
   * Adds or updates documents in the vector store
   * @param contextId - Unique identifier for the context
   * @param data - Array of documents to store
   */
  async upsert(
    contextId: string,
    data: InferContextMemory<any>[]
  ): Promise<void> {
    try {
      await this.ensureInitialized();

      // Generate IDs for the documents
      const ids = data.map((_, index) => `doc_${Date.now()}_${index}`);

      // Convert documents to strings if they aren't already
      const documents = data.map((item) =>
        typeof item === "string" ? item : JSON.stringify(item)
      );

      // Create metadata for each document
      const metadatas = data.map(() => ({
        contextId: contextId,
        timestamp: Date.now(),
      }));

      await this.collection.add({
        ids,
        documents,
        metadatas,
      });

    } catch (error) {
      console.error("Error in upsert operation:", error);
      throw error;
    }
  }

  /**
   * Searches for similar documents in the vector store
   * @param contextId - Context to search within
   * @param query - Query text to search for
   * @returns Array of matching documents
   */
  async query(contextId: string, query: string): Promise<any[]> {
    try {
      await this.ensureInitialized();
      
      try {
        // First try querying with the where filter
        const results = await this.collection.query({
          queryTexts: [query],
          nResults: 5,
          where: {
            contextId: contextId,
          },
        });
        
        return results.documents[0] || [];
      } catch (filterError) {
        // Log the specific error when the filtered query fails
        console.warn(`Query with filter failed for contextId '${contextId}'. Error:`, filterError);
        console.warn(`Trying query without filter...`);
        
        // If filtering fails, try without the where clause
        try {
          const results = await this.collection.query({
            queryTexts: [query],
            nResults: 5,
          });
          
          // Filter the results manually by contextId
          const filteredDocuments = results.documents[0] || [];
          const filteredMetadatas = results.metadatas[0] || [];
          
          // Find indices of documents with matching contextId
          const matchingIndices = filteredMetadatas
            .map((metadata, index) => (metadata?.contextId === contextId ? index : -1))
            .filter(index => index !== -1);
          
          // Filter documents using the matching indices
          const matchingDocuments = matchingIndices.map(index => filteredDocuments[index]);
          
          return matchingDocuments;
        } catch (noFilterError) {
          // Log the specific error when the unfiltered query also fails
          console.error(`Query without filter also failed for contextId '${contextId}'. Error:`, noFilterError);
          return []; // Return empty array as per original logic
        }
      }
    } catch (error) {
      // Log any other errors occurring during the query operation
      console.error(`Error in query operation for contextId '${contextId}':`, error);
      // Return empty array instead of throwing to avoid breaking the agent
      return [];
    }
  }

  /**
   * Creates a new index in ChromaDB
   * @param indexName - Name of the index to create
   */
  async createIndex(indexName: string): Promise<void> {
    try {
      await this.client.createCollection({
        name: indexName,
        embeddingFunction: this.embedder,
        metadata: {
          description: "Index collection",
        },
      });
    } catch (error) {
      console.error(`Error creating index "${indexName}":`, error);
      throw error;
    }
  }

  /**
   * Deletes an existing index from ChromaDB
   * @param indexName - Name of the index to delete
   */
  async deleteIndex(indexName: string): Promise<void> {
    try {
      const collection = await this.client.getCollection({
        name: indexName,
        embeddingFunction: this.embedder,
      });
      
      await collection.delete();
    } catch (error) {
      console.error(`Error deleting index "${indexName}":`, error);
      throw error;
    }
  }
}

/**
 * Factory function to create a new ChromaVectorStore instance
 * @param collectionName - Name of the ChromaDB collection to use (defaults to "default")
 * @param connection - Optional connection string for ChromaDB
 * @param embedder - Optional custom embedding function implementation
 * @returns A new ChromaVectorStore instance
 */
export function createChromaVectorStore(
  collectionName: string = "default",
  connection?: string,
  embedder?: IEmbeddingFunction
) {
  return new ChromaVectorStore(collectionName, connection, embedder);
}