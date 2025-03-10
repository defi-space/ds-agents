import { RpcProvider, Account, type Call, CallData } from "starknet";
import type { IChain } from "../types";

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
  public chainId = "starknet";
  /** RPC provider instance for connecting to Starknet */
  private provider: RpcProvider;
  /** Account instance for transaction signing */
  private account: Account;

  /**
   * Creates a new StarknetChain instance
   * @param config - Configuration options for the Starknet connection
   */
  constructor(config: StarknetChainConfig) {
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
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
      return this.provider.callContract(call);
    } catch (error) {
      return error instanceof Error
        ? error
        : new Error("Unknown error occurred");
    }
  }

  /**
   * Executes a state-changing transaction on Starknet
   * @param call - The transaction parameters
   * @returns The transaction receipt after confirmation
   * @throws Error if the transaction fails
   */
  public async write(call: Call): Promise<any> {
    try {
      call.calldata = CallData.compile(call.calldata || []);
      const { transaction_hash } = await this.account.execute(call);
      return this.account.waitForTransaction(transaction_hash, {
        retryInterval: 1000,
      });
    } catch (error) {
      return error instanceof Error
        ? error
        : new Error("Unknown error occurred");
    }
  }

  /**
   * Executes multiple calls in a single transaction
   * @param calls - Array of contract calls to execute
   * @returns The transaction result with receipt and status
   */
  public async executeMulticall(calls: Call[]): Promise<MulticallResult> {
    try {
      // Compile calldata for each call
      const compiledCalls = calls.map(call => ({
        ...call,
        calldata: CallData.compile(call.calldata || [])
      }));
      // Execute the multicall
      const { transaction_hash } = await this.account.execute(compiledCalls);
      // Wait for transaction confirmation
      const receipt = await this.account.waitForTransaction(transaction_hash, {
        retryInterval: 1000,
      });
      return {
        success: true,
        transactionHash: transaction_hash,
        receipt
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }

  /**
   * Estimates the fee for executing multiple calls
   * @param calls - Array of contract calls to estimate
   * @returns The estimated fee for the multicall transaction
   */
  public async estimateFee(calls: Call[]): Promise<any> {
    try {
      // Compile calldata for each call
      const compiledCalls = calls.map(call => ({
        ...call,
        calldata: CallData.compile(call.calldata || [])
      }));

      // Estimate fee for the multicall
      return this.account.estimateFee(compiledCalls);
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error occurred");
    }
  }

  /**
   * Performs multiple read-only calls in parallel
   * @param calls - Array of contract calls to execute
   * @returns Array of results from each call
   */
  public async multiCall(calls: Call[]): Promise<any[]> {
    try {
      // Compile calldata for each call
      const compiledCalls = calls.map(call => ({
        ...call,
        calldata: CallData.compile(call.calldata || [])
      }));

      // Execute all calls in parallel
      const results = await Promise.all(
        compiledCalls.map(call => this.provider.callContract(call))
      );

      return results;
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error occurred");
    }
  }
}
