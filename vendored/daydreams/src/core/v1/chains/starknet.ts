import { RpcProvider, Account, type Call, CallData, constants, num } from "starknet";
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
  /** Use legacy transactions instead of V3 transactions (V3 is default) */
  useLegacyTransactions?: boolean;
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
 * V3 transaction options for resource bounds
 */
export interface V3TransactionOptions {
  /** Maximum amount of L1 gas authorized */
  maxL1GasAmount?: bigint;
  /** Maximum price per unit of L1 gas (in FRI) */
  maxL1GasPricePerUnit?: bigint;
  /** Optional tip amount */
  tip?: bigint;
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
  /** Whether to use V3 transactions */
  private useV3Transactions: boolean;
  /** Default V3 transaction options */
  private defaultV3Options: V3TransactionOptions = {
    maxL1GasAmount: 2000n,
    maxL1GasPricePerUnit: 50000000000n, // 50 GWEI - much higher to accommodate network conditions
    tip: 10n ** 13n
  };

  /**
   * Creates a new StarknetChain instance
   * @param config - Configuration options for the Starknet connection
   */
  constructor(config: StarknetChainConfig) {
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
    // V3 transactions are the default, unless explicitly disabled
    this.useV3Transactions = !config.useLegacyTransactions;
    
    // Initialize account with V3 transaction version by default
    this.account = new Account(
      this.provider,
      config.address,
      config.privateKey,
      undefined,
      this.useV3Transactions ? constants.TRANSACTION_VERSION.V3 : undefined
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
   * Prepares V3 transaction options
   * @param options - Custom V3 transaction options
   * @returns Formatted transaction options for V3 transactions
   */
  private prepareV3TransactionOptions(options?: V3TransactionOptions) {
    const maxL1GasAmount = options?.maxL1GasAmount ?? this.defaultV3Options.maxL1GasAmount ?? 2000n;
    const maxL1GasPricePerUnit = options?.maxL1GasPricePerUnit ?? this.defaultV3Options.maxL1GasPricePerUnit ?? 50000000000n;
    const tip = options?.tip ?? this.defaultV3Options.tip ?? 10n ** 13n;

    return {
      version: 3,
      // maxFee is not used in V3 transactions but included for compatibility
      maxFee: 10n ** 15n,
      feeDataAvailabilityMode: 0, // L1 mode (currently only L1 is supported)
      tip: num.toHex(tip),
      paymasterData: [],
      resourceBounds: {
        l1_gas: {
          max_amount: num.toHex(maxL1GasAmount),
          max_price_per_unit: num.toHex(maxL1GasPricePerUnit),
        },
        l2_gas: {
          max_amount: num.toHex(0),
          max_price_per_unit: num.toHex(0),
        },
      },
    };
  }

  /**
   * Executes a state-changing transaction on Starknet
   * @param call - The transaction parameters
   * @param v3Options - Optional V3 transaction options
   * @returns The transaction receipt after confirmation
   * @throws Error if the transaction fails
   */
  public async write(call: Call, v3Options?: V3TransactionOptions): Promise<any> {
    try {
      call.calldata = CallData.compile(call.calldata || []);
      
      let txOptions = {};
      if (this.useV3Transactions) {
        // First estimate the fee to get current gas price
        const estimatedFee = await this.account.estimateFee(call);
        
        // Extract gas price from the estimate and add a buffer (e.g., 20% more)
        let gasPrice = 50000000000n; // Default fallback
        
        if (estimatedFee && 'gas_price' in estimatedFee) {
          // For older response format
          gasPrice = BigInt(Math.ceil(Number(estimatedFee.gas_price) * 1.2));
        } else if (estimatedFee && 'resourceBounds' in estimatedFee) {
          // For newer response format with resourceBounds
          const resourceBounds = (estimatedFee as any).resourceBounds;
          const l1GasPrice = resourceBounds?.l1_gas?.max_price_per_unit;
          if (l1GasPrice) {
            gasPrice = BigInt(Math.ceil(Number(l1GasPrice) * 1.2));
          }
        }
        
        // Use the dynamically determined gas price
        const dynamicOptions: V3TransactionOptions = {
          ...v3Options,
          maxL1GasPricePerUnit: gasPrice
        };
        
        txOptions = this.prepareV3TransactionOptions(dynamicOptions);
      }
      
      const { transaction_hash } = await this.account.execute(call, txOptions);
      const receipt = await this.provider.waitForTransaction(transaction_hash, {
        retryInterval: 1000,
      });
      
      return receipt;
    } catch (error) {
      return error instanceof Error
        ? error
        : new Error("Unknown error occurred");
    }
  }

  /**
   * Executes multiple calls in a single transaction
   * @param calls - Array of contract calls to execute
   * @param v3Options - Optional V3 transaction options
   * @returns The transaction result with receipt and status
   */
  public async executeMulticall(calls: Call[], v3Options?: V3TransactionOptions): Promise<MulticallResult> {
    try {
      // Compile calldata for each call
      const compiledCalls = calls.map(call => ({
        ...call,
        calldata: CallData.compile(call.calldata || [])
      }));
      
      // Prepare transaction options
      let txOptions = {};
      if (this.useV3Transactions) {
        // First estimate the fee to get current gas price
        const estimatedFee = await this.account.estimateFee(compiledCalls);
        
        // Extract gas price from the estimate and add a buffer (e.g., 20% more)
        let gasPrice = 50000000000n; // Default fallback
        
        if (estimatedFee && 'gas_price' in estimatedFee) {
          // For older response format
          gasPrice = BigInt(Math.ceil(Number(estimatedFee.gas_price) * 1.2));
        } else if (estimatedFee && 'resourceBounds' in estimatedFee) {
          // For newer response format with resourceBounds
          const resourceBounds = (estimatedFee as any).resourceBounds;
          const l1GasPrice = resourceBounds?.l1_gas?.max_price_per_unit;
          if (l1GasPrice) {
            gasPrice = BigInt(Math.ceil(Number(l1GasPrice) * 1.2));
          }
        }
        
        // Use the dynamically determined gas price
        const dynamicOptions: V3TransactionOptions = {
          ...v3Options,
          maxL1GasPricePerUnit: gasPrice
        };
        
        txOptions = this.prepareV3TransactionOptions(dynamicOptions);
      }
      
      // Execute the multicall
      const { transaction_hash } = await this.account.execute(compiledCalls, txOptions);
      
      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(transaction_hash, {
        retryInterval: 1000,
      });
      
      return {
        success: receipt.isSuccess?.() ?? true,
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
   * @param v3Options - Optional V3 transaction options
   * @returns The estimated fee for the multicall transaction
   */
  public async estimateFee(calls: Call[], v3Options?: V3TransactionOptions): Promise<any> {
    try {
      // Compile calldata for each call
      const compiledCalls = calls.map(call => ({
        ...call,
        calldata: CallData.compile(call.calldata || [])
      }));

      // Prepare transaction options
      let txOptions = {};
      if (this.useV3Transactions) {
        // For fee estimation, we'll use the provided options or defaults
        // We don't need to dynamically determine gas price here since we're just estimating
        txOptions = this.prepareV3TransactionOptions(v3Options);
      }

      // Estimate fee for the multicall
      return this.account.estimateFee(compiledCalls, txOptions);
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
  
  /**
   * Sets the default V3 transaction options
   * @param options - Default V3 transaction options to use
   */
  public setDefaultV3Options(options: V3TransactionOptions): void {
    this.defaultV3Options = {
      ...this.defaultV3Options,
      ...options
    };
  }
  
  /**
   * Enables or disables V3 transactions
   * @param enable - Whether to enable V3 transactions
   */
  public setUseV3Transactions(enable: boolean): void {
    this.useV3Transactions = enable;
    
    // Use the original private key from constructor
    const privateKey = this.account.signer instanceof Object && 
                      'privateKey' in this.account.signer ? 
                      String(this.account.signer.privateKey) : 
                      '';
    
    // Recreate the account with the appropriate transaction version
    this.account = new Account(
      this.provider,
      this.account.address,
      privateKey,
      undefined,
      enable ? constants.TRANSACTION_VERSION.V3 : undefined
    );
  }
}
