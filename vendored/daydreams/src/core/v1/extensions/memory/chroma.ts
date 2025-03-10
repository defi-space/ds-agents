/**
 * Imports required dependencies from chromadb and local types
 */
import {
  ChromaClient,
  Collection,
  GoogleGenerativeAiEmbeddingFunction,
  type IEmbeddingFunction,
} from "chromadb";
import type { InferContextMemory, VectorStore } from "../../types";

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
      
      // Use the agent-specific API key if available, otherwise fall back to the default GOOGLE_API_KEY
      const apiKey = process.env[apiKeyEnvVar] || process.env.GOOGLE_API_KEY;
      
      if (!apiKey) {
        console.warn(`[ChromaVectorStore] No API key found for agent ${agentId}. Check your .env file for ${apiKeyEnvVar} or GOOGLE_API_KEY.`);
        throw new Error(`No API key found for embeddings. Please check your .env file for ${apiKeyEnvVar} or GOOGLE_API_KEY.`);
      } else {
        console.log(`[ChromaVectorStore] Using API key for agent ${agentId} (${apiKeyEnvVar})`);
      }
      
      this.embedder = new GoogleGenerativeAiEmbeddingFunction({
        googleApiKey: apiKey!,
        model: "text-embedding-004",
      });
    } else {
      this.embedder = embedder;
    }

    this.client = new ChromaClient({
      path: connection || "http://localhost:8000",
    });

    this.initCollection(collectionName).catch(error => {
      console.error("[ChromaVectorStore] Failed to initialize in constructor:", error);
      throw error;
    });
  }

  /**
   * Initializes or retrieves the ChromaDB collection
   * @param collectionName - Name of the collection to initialize
   */
  private async initCollection(collectionName: string) {
    try {      
      // Get or create the collection
      this.collection = await this.client.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: this.embedder,
        metadata: {
          description: "Memory storage for AI consciousness",
        },
      });

      // Verify collection was created
      const collectionInfo = await this.collection.get();
     
      this.isInitialized = true;
    } catch (error) {
      console.error("[ChromaVectorStore] Failed to initialize collection:", error);
      this.isInitialized = false;
      throw error;
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
      console.error("[ChromaVectorStore] Error in upsert operation:", error);
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

      // Parse the query if it's a JSON string
      let queryText = query;

      // Get collection info before query
      const results = await this.collection.query({
        queryTexts: [queryText],
        nResults: 5,
        where: {
          contextId: contextId,
        },
      });
      return results.documents[0] || [];
    } catch (error) {
      console.error("[ChromaVectorStore] Error in query operation:", {
        error,
        contextId,
        query,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
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
