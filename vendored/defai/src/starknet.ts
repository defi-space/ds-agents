import {
  RpcProvider,
  Account,
  type Call,
  CallData,
  constants,
  num,
  type GetTransactionReceiptResponse,
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
  /** Default transaction options for V3 transactions */
  defaultV3Options?: V3TransactionOptions;
  /** Gas price buffer multiplier (default: 1.2 or 20% buffer) */
  gasPriceBufferMultiplier?: number;
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
  /** Optional fee data availability mode (default: 0 for L1) */
  feeDataAvailabilityMode?: number;
  /** Optional max fee for compatibility with legacy transactions */
  maxFee?: bigint;
}

/**
 * Network parameters for transaction fee estimation
 */
interface NetworkParams {
  gasPrice: bigint;
  recommendedMaxFee: bigint;
  recommendedTip: bigint;
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
  /** Default V3 transaction options */
  private defaultV3Options: V3TransactionOptions;
  /** Gas price buffer multiplier */
  private gasPriceBufferMultiplier: number;
  /** Default L1 gas amount for simple transactions */
  private static readonly DEFAULT_L1_GAS_AMOUNT = BigInt(2000);
  /** Default gas price in wei (0.1 Gwei) */
  private static readonly DEFAULT_GAS_PRICE = BigInt(100000000);

  /**
   * Creates a new StarknetChain instance
   * @param config - Configuration options for the Starknet connection
   */
  constructor(config: StarknetChainConfig) {
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
    this.gasPriceBufferMultiplier = config.gasPriceBufferMultiplier || 1.2;
    this.defaultV3Options = config.defaultV3Options || {};
    
    // Initialize account with V3 transaction version
    this.account = new Account(
      this.provider,
      config.address,
      config.privateKey,
      undefined,
      constants.TRANSACTION_VERSION.V3
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
   * Gets current network conditions for transaction parameters
   * @returns Current recommended transaction parameters
   */
  private async getNetworkParams(): Promise<NetworkParams> {
    try {
      // Default fallback values
      let gasPrice = StarknetChain.DEFAULT_GAS_PRICE;
      let recommendedMaxFee = gasPrice * StarknetChain.DEFAULT_L1_GAS_AMOUNT;
      let recommendedTip = recommendedMaxFee / BigInt(100); // 1% of max fee

      // Try to get gas price from the latest block
      try {
        const block = await this.provider.getBlock('latest');
        
        if (block && typeof block === 'object') {
          gasPrice = this.extractGasPriceFromBlock(block);
        }
        
        // If we couldn't get gas price from block, try a fee estimation
        if (gasPrice === StarknetChain.DEFAULT_GAS_PRICE) {
          const params = await this.estimateGasPriceFromDummyCall();
          gasPrice = params.gasPrice;
          recommendedMaxFee = params.recommendedMaxFee;
        }

        // Apply buffer to gas price for safety
        const bufferedGasPrice = this.applyGasPriceBuffer(gasPrice);
        
        // If we have a gas price but couldn't calculate max fee, estimate it
        if (recommendedMaxFee === gasPrice * StarknetChain.DEFAULT_L1_GAS_AMOUNT) {
          recommendedMaxFee = bufferedGasPrice * StarknetChain.DEFAULT_L1_GAS_AMOUNT;
        }

        // Calculate a reasonable tip (1% of max fee)
        recommendedTip = recommendedMaxFee / BigInt(100);

        return {
          gasPrice: bufferedGasPrice,
          recommendedMaxFee,
          recommendedTip,
        };
      } catch (error) {
        console.warn("Fee estimation failed, using default values:", error);
        return this.getDefaultNetworkParams();
      }
    } catch (error) {
      console.warn("Network parameter retrieval failed, using defaults:", error);
      return this.getDefaultNetworkParams();
    }
  }

  /**
   * Extracts gas price from a block object
   * @param block - The block object from provider
   * @returns The extracted gas price
   */
  private extractGasPriceFromBlock(block: any): bigint {
    // Try to extract gas_price
    if ('gas_price' in block && block.gas_price) {
      const gasPriceValue = this.normalizeNumberValue(block.gas_price);
      try {
        return BigInt(gasPriceValue);
      } catch (e) {
        console.warn("Failed to parse gas_price from block:", e);
      }
    } 
    // Try to extract l1_gas_price
    else if ('l1_gas_price' in block && block.l1_gas_price) {
      try {
        if (typeof block.l1_gas_price === 'object' && 
            block.l1_gas_price !== null && 
            'price_in_fri' in block.l1_gas_price) {
          return BigInt(block.l1_gas_price.price_in_fri);
        } else {
          return BigInt(this.normalizeNumberValue(block.l1_gas_price));
        }
      } catch (e) {
        console.warn("Failed to parse l1_gas_price from block:", e);
      }
    }
    
    // Return default if extraction failed
    return StarknetChain.DEFAULT_GAS_PRICE;
  }

  /**
   * Normalizes a value to string for BigInt conversion
   * @param value - The value to normalize
   * @returns A string representation of the value
   */
  private normalizeNumberValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'number') {
      return String(value);
    } else {
      return JSON.stringify(value);
    }
  }

  /**
   * Estimates gas price using a dummy call
   * @returns Estimated gas price and max fee
   */
  private async estimateGasPriceFromDummyCall(): Promise<{
    gasPrice: bigint;
    recommendedMaxFee: bigint;
  }> {
    // Use a simple no-op call for estimation (get_nonce is available on all account contracts)
    const dummyCall: Call = {
      contractAddress: this.account.address,
      entrypoint: "get_nonce",
      calldata: [],
    };

    // Try to estimate fee for the dummy call
    const estimate = await this.account.estimateFee(dummyCall);
    let gasPrice = StarknetChain.DEFAULT_GAS_PRICE;
    let recommendedMaxFee = gasPrice * StarknetChain.DEFAULT_L1_GAS_AMOUNT;

    // Extract gas price based on response format
    if (estimate && "gas_price" in estimate) {
      // For older response format
      gasPrice = BigInt(estimate.gas_price);
      recommendedMaxFee = BigInt(estimate.overall_fee);
    } else if (estimate && "resourceBounds" in estimate) {
      // For newer response format with resourceBounds
      const resourceBounds = (estimate as any).resourceBounds;
      const l1GasPrice = resourceBounds?.l1_gas?.max_price_per_unit;
      if (l1GasPrice) {
        gasPrice = BigInt(l1GasPrice);

        // Calculate a reasonable max fee based on resource bounds
        const l1GasAmount = resourceBounds?.l1_gas?.max_amount;
        if (l1GasAmount) {
          recommendedMaxFee = BigInt(l1GasAmount) * gasPrice;
        }
      }
    }

    return { gasPrice, recommendedMaxFee };
  }

  /**
   * Applies buffer to gas price
   * @param gasPrice - The base gas price
   * @returns Buffered gas price
   */
  private applyGasPriceBuffer(gasPrice: bigint): bigint {
    return BigInt(Math.ceil(Number(gasPrice) * this.gasPriceBufferMultiplier));
  }

  /**
   * Gets default network parameters
   * @returns Default network parameters
   */
  private getDefaultNetworkParams(): NetworkParams {
    const gasPrice = StarknetChain.DEFAULT_GAS_PRICE;
    const bufferedGasPrice = this.applyGasPriceBuffer(gasPrice);
    const recommendedMaxFee = bufferedGasPrice * StarknetChain.DEFAULT_L1_GAS_AMOUNT;
    const recommendedTip = recommendedMaxFee / BigInt(100);

    return {
      gasPrice: bufferedGasPrice,
      recommendedMaxFee,
      recommendedTip,
    };
  }

  /**
   * Prepares V3 transaction options
   * @param options - Custom V3 transaction options
   * @returns Formatted transaction options for V3 transactions
   */
  private async prepareV3TransactionOptions(
    options?: V3TransactionOptions
  ): Promise<any> {
    // Get current network parameters for dynamic values
    const { gasPrice, recommendedMaxFee, recommendedTip } =
      await this.getNetworkParams();

    // Apply default values from config if present, otherwise use network parameters
    const maxL1GasAmount =
      options?.maxL1GasAmount ??
      this.defaultV3Options.maxL1GasAmount ??
      StarknetChain.DEFAULT_L1_GAS_AMOUNT;

    const maxL1GasPricePerUnit =
      options?.maxL1GasPricePerUnit ??
      this.defaultV3Options.maxL1GasPricePerUnit ??
      gasPrice;

    const tip = options?.tip ?? this.defaultV3Options.tip ?? recommendedTip;

    const maxFee =
      options?.maxFee ?? this.defaultV3Options.maxFee ?? recommendedMaxFee;

    const feeDataAvailabilityMode =
      options?.feeDataAvailabilityMode ??
      this.defaultV3Options.feeDataAvailabilityMode ??
      0; // L1 mode as default

    // Return the formatted transaction options according to StarknetJS v7+ format
    return {
      version: constants.TRANSACTION_VERSION.V3,
      maxFee: num.toHex(maxFee),
      feeDataAvailabilityMode,
      tip: num.toHex(tip),
      paymasterData: [], // Empty array for no paymaster
      nonce: undefined, // Let the account implementation handle nonce management
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
   * Dynamically estimates appropriate gas parameters for a transaction
   * @param call - The call or calls to estimate gas for
   * @param v3Options - Optional V3 transaction options to use as base
   * @returns Optimized V3 transaction options
   */
  private async estimateGasParameters(
    call: Call | Call[],
    v3Options?: V3TransactionOptions
  ): Promise<any> {
    try {
      // First try to estimate the fee to get accurate gas parameters
      const estimatedFee = await this.account.estimateFee(call);
      
      // Extract gas parameters based on the response format
      let gasPrice: bigint | undefined;
      let gasAmount: bigint | undefined;
      
      if (estimatedFee && "gas_price" in estimatedFee) {
        // For older response format
        gasPrice = BigInt(estimatedFee.gas_price);
        // Try to extract gas used if available
        if ("gas_usage" in estimatedFee) {
          gasAmount = BigInt((estimatedFee as any).gas_usage);
        }
      } else if (estimatedFee && "resourceBounds" in estimatedFee) {
        // For newer response format with resourceBounds
        const resourceBounds = (estimatedFee as any).resourceBounds;
        
        // Extract L1 gas parameters
        if (resourceBounds?.l1_gas) {
          const l1Gas = resourceBounds.l1_gas;
          if (l1Gas.max_price_per_unit) {
            gasPrice = BigInt(l1Gas.max_price_per_unit);
          }
          if (l1Gas.max_amount) {
            gasAmount = BigInt(l1Gas.max_amount);
          }
        }
      }
      
      // If we couldn't get specific gas parameters, fall back to network params
      if (!gasPrice || !gasAmount) {
        const networkParams = await this.getNetworkParams();
        gasPrice = gasPrice || networkParams.gasPrice;
        gasAmount = gasAmount || StarknetChain.DEFAULT_L1_GAS_AMOUNT;
      }
      
      // Apply buffer to gas price for safety
      const bufferedGasPrice = this.applyGasPriceBuffer(gasPrice);
      
      // Apply buffer to gas amount for safety (add 10%)
      const bufferedGasAmount = BigInt(Math.ceil(Number(gasAmount) * 1.1));
      
      // Calculate max fee based on buffered values
      const calculatedMaxFee = bufferedGasPrice * bufferedGasAmount;
      
      // Merge with provided options, prioritizing user-provided values
      const dynamicOptions: V3TransactionOptions = {
        ...v3Options,
        maxL1GasAmount: v3Options?.maxL1GasAmount ?? bufferedGasAmount,
        maxL1GasPricePerUnit: v3Options?.maxL1GasPricePerUnit ?? bufferedGasPrice,
        maxFee: v3Options?.maxFee ?? calculatedMaxFee,
      };
      
      // Prepare final transaction options
      return this.prepareV3TransactionOptions(dynamicOptions);
    } catch (error) {
      console.warn("Dynamic gas estimation failed, using default parameters:", error);
      // If estimation fails, fall back to default parameters
      return this.prepareV3TransactionOptions(v3Options);
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

      // Use dynamic gas estimation for optimal parameters
      const txOptions = await this.estimateGasParameters(call, v3Options);

      // Execute the transaction with optimized V3 transaction options
      const { transaction_hash } = await this.account.execute(call, txOptions);
      
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

      // Use dynamic gas estimation for optimal parameters
      const txOptions = await this.estimateGasParameters(compiledCalls, v3Options);

      // Execute the multicall with optimized V3 transaction options
      const { transaction_hash } = await this.account.execute(
        compiledCalls,
        txOptions
      );

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
   * Estimates the fee for executing multiple calls
   * @param calls - Array of contract calls to estimate
   * @param v3Options - Optional V3 transaction options
   * @returns The estimated fee for the multicall transaction
   */
  public async estimateFee(
    calls: Call[],
    v3Options?: V3TransactionOptions
  ): Promise<any> {
    try {
      // Compile calldata for each call
      const compiledCalls = this.compileCalldata(calls);

      // For fee estimation, use current network parameters and provided options
      const txOptions = await this.prepareV3TransactionOptions(v3Options);

      // Estimate fee for the multicall
      return this.account.estimateFee(compiledCalls, txOptions);
    } catch (error) {
      throw this.formatError(error, "Fee estimation failed");
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

  /**
   * Sets the default V3 transaction options
   * @param options - Default V3 transaction options to use
   */
  public setDefaultV3Options(options: V3TransactionOptions): void {
    this.defaultV3Options = {
      ...this.defaultV3Options,
      ...options,
    };
  }

  /**
   * Sets the gas price buffer multiplier
   * @param multiplier - Multiplier to apply to gas price estimates (e.g., 1.2 for 20% buffer)
   */
  public setGasPriceBufferMultiplier(multiplier: number): void {
    if (multiplier <= 0) {
      throw new Error("Gas price buffer multiplier must be positive");
    }
    this.gasPriceBufferMultiplier = multiplier;
  }
}
