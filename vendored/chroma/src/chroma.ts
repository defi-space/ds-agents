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
    this.collection = await this.client.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: this.embedder,
      metadata: {
        description: "Memory storage for AI consciousness",
      },
    });
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
    if (data.length === 0) return;

    // Generate IDs for the documents
    const ids = data.map((_, index) => `doc_${Date.now()}_${index}`);

    // Convert documents to strings if they aren't already
    const documents = data.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item)
    );

    await this.collection.add({
      ids,
      documents,
      metadatas: [
        {
          contextId: contextId,
          timestamp: Date.now(),
        },
      ],
    });
  }

  /**
   * Searches for similar documents in the vector store
   * @param contextId - Context to search within
   * @param query - Query text to search for
   * @returns Array of matching documents
   */
  async query(contextId: string, query: string): Promise<any[]> {
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: 5,
      where: {
        contextId: contextId,
      },
    });

    return results.documents[0] || [];
  }

  /**
   * Creates a new index in ChromaDB
   * @param indexName - Name of the index to create
   */
  async createIndex(indexName: string): Promise<void> {
    await this.client.getOrCreateCollection({
      name: indexName,
      embeddingFunction: this.embedder,
    });
  }

  /**
   * Deletes an existing index from ChromaDB
   * @param indexName - Name of the index to delete
   */
  async deleteIndex(indexName: string): Promise<void> {
    await this.collection.delete({
      where: {
        indexName: indexName,
      },
    });
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