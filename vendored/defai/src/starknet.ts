import {
  RpcProvider,
  Account,
  type Call,
  CallData,
  type GetTransactionReceiptResponse,
  ETransactionVersion,
} from "starknet";
import type { IChain } from "../../core/src";

/**
 * Configuration options for initializing a Starknet chain connection
 */
export interface StarknetChainConfig {
  /** The RPC endpoint URL for connecting to Starknet */
  rpcUrl: string;
  /** The Starknet account contract address */
  address: string;
  /** Private key for signing transactions. Should be managed securely! */
  privateKey: string;
}

/**
 * Result type for multicall operations
 */
export interface MulticallResult {
  success: boolean;
  error?: string;
  transactionHash?: string;
  receipt?: any;
  results?: any[];
}

/**
 * V3 transaction options (for backward compatibility - Starknet.js handles v3 automatically)
 */
export interface V3TransactionOptions {
  /** Optional max fee for legacy compatibility */
  maxFee?: bigint;
}

/**
 * Implementation of the IChain interface for interacting with the Starknet L2 blockchain
 *
 * @example
 * ```ts
 * const starknet = new StarknetChain({
 *   rpcUrl: process.env.STARKNET_RPC_URL,
 *   address: process.env.STARKNET_ADDRESS,
 *   privateKey: process.env.STARKNET_PRIVATE_KEY
 * });
 * ```
 */
export class StarknetChain implements IChain {
  /** Unique identifier for this chain implementation */
  public readonly chainId = "starknet";
  /** RPC provider instance for connecting to Starknet */
  private readonly provider: RpcProvider;
  /** Account instance for transaction signing */
  private account: Account;

  /**
   * Creates a new StarknetChain instance
   * @param config - Configuration options for the Starknet connection
   */
  constructor(config: StarknetChainConfig) {
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
    
    // Initialize account - Starknet.js will use V3 transactions by default
    this.account = new Account(
      this.provider,
      config.address,
      config.privateKey
    );
  }

  /**
   * Returns the address of the account
   * @returns The Starknet account address as a hex string
   */
  public getAddress(): string {
    return this.account.address;
  }

  /**
   * Performs a read-only call to a Starknet contract
   * @param call - The contract call parameters
   * @returns The result of the contract call
   * @throws Error if the call fails
   */
  public async read(call: Call): Promise<any> {
    try {
      call.calldata = CallData.compile(call.calldata || []);
      return await this.provider.callContract(call);
    } catch (error) {
      throw this.formatError(error, `Failed to read from contract ${call.contractAddress}`);
    }
  }

  /**
   * Executes a state-changing transaction on Starknet
   * @param call - The transaction parameters
   * @param v3Options - Optional V3 transaction options
   * @returns The transaction receipt after confirmation
   * @throws Error if the transaction fails
   */
  public async write(
    call: Call,
    v3Options?: V3TransactionOptions
  ): Promise<any> {
    try {
      // Ensure calldata is properly compiled
      call.calldata = CallData.compile(call.calldata || []);

      // Explicitly use V3 transactions with built-in fee estimation
      const { transaction_hash } = await this.account.execute(call, {
        version: ETransactionVersion.V3
      });
      
      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(transaction_hash, {
        retryInterval: 1000,
      });

      // Check if transaction was successful
      this.validateTransactionReceipt(receipt);

      return receipt;
    } catch (error) {
      throw this.formatError(error, "Transaction execution failed");
    }
  }

  /**
   * Validates a transaction receipt to check for success
   * @param receipt - The transaction receipt
   * @throws Error if the transaction failed
   */
  private validateTransactionReceipt(receipt: GetTransactionReceiptResponse): void {
    // Check transaction status using type-safe property access
    // Different StarknetJS versions have different receipt formats
    const status = this.getTransactionStatus(receipt);
    if (status === 'REJECTED' || status === 'REVERTED') {
      const revertReason = this.getRevertReason(receipt);
      throw new Error(`Transaction reverted: ${revertReason}`);
    }
  }

  /**
   * Safely extracts transaction status from receipt
   * @param receipt - The transaction receipt
   * @returns The transaction status
   */
  private getTransactionStatus(receipt: GetTransactionReceiptResponse): string {
    // Handle different receipt formats safely
    if ('status' in receipt && receipt.status) {
      return receipt.status as string;
    }
    
    if ('execution_status' in receipt && receipt.execution_status) {
      return receipt.execution_status as string;
    }
    
    // Default to a safe value if status can't be determined
    return 'UNKNOWN';
  }

  /**
   * Safely extracts revert reason from receipt
   * @param receipt - The transaction receipt
   * @returns The revert reason or default message
   */
  private getRevertReason(receipt: GetTransactionReceiptResponse): string {
    if ('revert_reason' in receipt && receipt.revert_reason) {
      return receipt.revert_reason as string;
    }
    
    if ('revertReason' in receipt && (receipt as any).revertReason) {
      return (receipt as any).revertReason as string;
    }
    
    return 'Unknown reason';
  }

  /**
   * Formats an error for consistent error handling
   * @param error - The original error
   * @param defaultMessage - Default message if error is not an Error instance
   * @returns Formatted Error object
   */
  private formatError(error: unknown, defaultMessage: string): Error {
    if (error instanceof Error) {
      return error;
    } else if (typeof error === 'string') {
      return new Error(error);
    } else {
      return new Error(defaultMessage);
    }
  }

  /**
   * Executes multiple calls in a single transaction
   * @param calls - Array of contract calls to execute
   * @param v3Options - Optional V3 transaction options
   * @returns The transaction result with receipt and status
   */
  public async writeMulticall(
    calls: Call[],
    v3Options?: V3TransactionOptions
  ): Promise<MulticallResult> {
    try {
      // Validate input
      if (!calls || calls.length === 0) {
        return {
          success: false,
          error: "No calls provided for multicall"
        };
      }

      // Compile calldata for each call
      const compiledCalls = this.compileCalldata(calls);

      // Execute the multicall with V3 transactions and automatic fee estimation
      const { transaction_hash } = await this.account.execute(compiledCalls, {
        version: ETransactionVersion.V3
      });

      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(transaction_hash, {
        retryInterval: 1000,
      });

      // Extract results from receipt if available
      const results = this.extractResultsFromReceipt(receipt);
      
      // Determine success based on execution status using helper methods
      const status = this.getTransactionStatus(receipt);
      const success = status === 'ACCEPTED_ON_L1' || status === 'ACCEPTED_ON_L2' || status === 'SUCCEEDED';
      
      // Get revert reason if available
      const revertReason = !success ? this.getRevertReason(receipt) : undefined;
      
      return {
        success,
        transactionHash: transaction_hash,
        receipt,
        results,
        error: revertReason
      };
    } catch (error) {
      // Properly format errors for the MulticallResult
      return {
        success: false,
        error: error instanceof Error ? error.message : 
               (typeof error === 'string' ? error : "Unknown error occurred during multicall")
      };
    }
  }

  /**
   * Compiles calldata for an array of calls
   * @param calls - Array of calls to compile
   * @returns Array of calls with compiled calldata
   */
  private compileCalldata(calls: Call[]): Call[] {
    return calls.map((call) => ({
      ...call,
      calldata: CallData.compile(call.calldata || []),
    }));
  }

  /**
   * Extracts results from a transaction receipt
   * @param receipt - The transaction receipt
   * @returns Array of results if available
   */
  private extractResultsFromReceipt(receipt: GetTransactionReceiptResponse): any[] | undefined {
    // Safely access events property
    const events = 'events' in receipt ? receipt.events : undefined;
    if (!events || !Array.isArray(events) || events.length === 0) {
      return undefined;
    }

    try {
      // Attempt to extract results from events
      return events.map((event: any) => ({
        contractAddress: event.from_address,
        data: event.data,
        keys: event.keys
      }));
    } catch (e) {
      console.warn("Failed to parse multicall results from events:", e);
      return undefined;
    }
  }

  /**
   * Performs multiple read-only calls in parallel
   * @param calls - Array of contract calls to execute
   * @returns Array of results from each call
   */
  public async readMulticall(calls: Call[]): Promise<any[]> {
    try {
      // Validate input
      if (!calls || calls.length === 0) {
        return [];
      }

      // Compile calldata for each call
      const compiledCalls = this.compileCalldata(calls);

      // For better error handling, we'll use allSettled instead of all
      const settledResults = await Promise.allSettled(
        compiledCalls.map(async (call) => {
          try {
            return await this.provider.callContract(call);
          } catch (error) {
            throw this.formatError(
              error, 
              `Call failed for contract ${call.contractAddress}, entrypoint ${call.entrypoint}`
            );
          }
        })
      );

      // Process the results
      return settledResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          // For rejected promises, return an error object
          return {
            error: true,
            message: result.reason?.message || 'Unknown error',
            contractAddress: compiledCalls[index].contractAddress,
            entrypoint: compiledCalls[index].entrypoint,
          };
        }
      });
    } catch (error) {
      throw this.formatError(error, "Failed to execute readMulticall operation");
    }
  }
}