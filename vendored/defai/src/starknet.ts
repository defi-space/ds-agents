import {
  RpcProvider,
  Account,
  type Call,
  CallData,
  constants,
  num,
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
  /** Use legacy transactions instead of V3 transactions (V3 is default) */
  useLegacyTransactions?: boolean;
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
  private defaultV3Options: V3TransactionOptions;
  /** Gas price buffer multiplier */
  private gasPriceBufferMultiplier: number;

  /**
   * Creates a new StarknetChain instance
   * @param config - Configuration options for the Starknet connection
   */
  constructor(config: StarknetChainConfig) {
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
    // V3 transactions are the default, unless explicitly disabled
    this.useV3Transactions = !config.useLegacyTransactions;

    // Set gas price buffer multiplier
    this.gasPriceBufferMultiplier = config.gasPriceBufferMultiplier || 1.2;

    // Set default V3 transaction options (empty object to be filled dynamically)
    this.defaultV3Options = config.defaultV3Options || {};

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
   * Gets current network conditions for transaction parameters
   * @returns Current recommended transaction parameters
   */
  private async getNetworkParams(): Promise<{
    gasPrice: bigint;
    recommendedMaxFee: bigint;
    recommendedTip: bigint;
  }> {
    try {
      // Instead of using a nonce call, use a simple balance check on the ERC20 contract
      // This is more likely to work across different account implementations
      const dummyCall: Call = {
        contractAddress: this.account.address,
        entrypoint: "getBalance",
        calldata: [],
      };

      // Use hardcoded values if estimation fails
      let gasPrice = BigInt(100000000); // 0.1 Gwei fallback
      let recommendedMaxFee = gasPrice * BigInt(2000);
      let recommendedTip = recommendedMaxFee / BigInt(100); // 1% of max fee

      try {
        // Try to estimate fee, but don't fail if it doesn't work
        const estimate = await this.account.estimateFee(dummyCall);

        // Extract current gas price based on response format
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
      } catch (error) {
        // If estimation fails, use the default values
        console.warn("Fee estimation failed, using default values:", error);
      }

      // Calculate a reasonable tip based on network conditions
      // Typically a small percentage of the max fee
      recommendedTip = recommendedMaxFee / BigInt(100); // 1% of max fee

      return {
        gasPrice,
        recommendedMaxFee,
        recommendedTip,
      };
    } catch (error) {
      // Fallback to reasonable defaults if anything goes wrong
      const gasPrice = BigInt(100000000); // 0.1 Gwei
      const recommendedMaxFee = gasPrice * BigInt(2000);
      const recommendedTip = recommendedMaxFee / BigInt(100); // 1% of max fee

      return {
        gasPrice,
        recommendedMaxFee,
        recommendedTip,
      };
    }
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

    // Apply buffer to gas price for safety
    const bufferedGasPrice = BigInt(
      Math.ceil(Number(gasPrice) * this.gasPriceBufferMultiplier)
    );

    // Apply default values from config if present, otherwise use network parameters
    const maxL1GasAmount =
      options?.maxL1GasAmount ??
      this.defaultV3Options.maxL1GasAmount ??
      BigInt(2000); // Default if all else fails

    const maxL1GasPricePerUnit =
      options?.maxL1GasPricePerUnit ??
      this.defaultV3Options.maxL1GasPricePerUnit ??
      bufferedGasPrice;

    const tip = options?.tip ?? this.defaultV3Options.tip ?? recommendedTip;

    const maxFee =
      options?.maxFee ?? this.defaultV3Options.maxFee ?? recommendedMaxFee;

    const feeDataAvailabilityMode =
      options?.feeDataAvailabilityMode ??
      this.defaultV3Options.feeDataAvailabilityMode ??
      0; // L1 mode as default

    // Return the formatted transaction options
    return {
      version: 3,
      // maxFee included for compatibility
      maxFee: num.toHex(maxFee),
      feeDataAvailabilityMode,
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
  public async write(
    call: Call,
    v3Options?: V3TransactionOptions
  ): Promise<any> {
    try {
      call.calldata = CallData.compile(call.calldata || []);

      let txOptions = {};
      if (this.useV3Transactions) {
        // First estimate the fee to get current gas price
        const estimatedFee = await this.account.estimateFee(call);

        // Extract gas price from the estimate
        let gasPrice;

        if (estimatedFee && "gas_price" in estimatedFee) {
          // For older response format
          gasPrice = BigInt(estimatedFee.gas_price);
        } else if (estimatedFee && "resourceBounds" in estimatedFee) {
          // For newer response format with resourceBounds
          const resourceBounds = (estimatedFee as any).resourceBounds;
          const l1GasPrice = resourceBounds?.l1_gas?.max_price_per_unit;
          if (l1GasPrice) {
            gasPrice = BigInt(l1GasPrice);
          }
        }

        // Apply buffer to gas price if we got a value
        if (gasPrice) {
          const bufferedGasPrice = BigInt(
            Math.ceil(Number(gasPrice) * this.gasPriceBufferMultiplier)
          );

          // Merge with provided options, prioritizing user-provided values
          const dynamicOptions: V3TransactionOptions = {
            ...v3Options,
            maxL1GasPricePerUnit:
              v3Options?.maxL1GasPricePerUnit ?? bufferedGasPrice,
          };

          txOptions = await this.prepareV3TransactionOptions(dynamicOptions);
        } else {
          // If we couldn't extract gas price, use provided options or default
          txOptions = await this.prepareV3TransactionOptions(v3Options);
        }
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
  public async executeMulticall(
    calls: Call[],
    v3Options?: V3TransactionOptions
  ): Promise<MulticallResult> {
    try {
      // Compile calldata for each call
      const compiledCalls = calls.map((call) => ({
        ...call,
        calldata: CallData.compile(call.calldata || []),
      }));

      // Prepare transaction options
      let txOptions = {};
      if (this.useV3Transactions) {
        // First estimate the fee to get current gas price
        const estimatedFee = await this.account.estimateFee(compiledCalls);

        // Extract gas price from the estimate
        let gasPrice;

        if (estimatedFee && "gas_price" in estimatedFee) {
          // For older response format
          gasPrice = BigInt(estimatedFee.gas_price);
        } else if (estimatedFee && "resourceBounds" in estimatedFee) {
          // For newer response format with resourceBounds
          const resourceBounds = (estimatedFee as any).resourceBounds;
          const l1GasPrice = resourceBounds?.l1_gas?.max_price_per_unit;
          if (l1GasPrice) {
            gasPrice = BigInt(l1GasPrice);
          }
        }

        // Apply buffer to gas price if we got a value
        if (gasPrice) {
          const bufferedGasPrice = BigInt(
            Math.ceil(Number(gasPrice) * this.gasPriceBufferMultiplier)
          );

          // Merge with provided options, prioritizing user-provided values
          const dynamicOptions: V3TransactionOptions = {
            ...v3Options,
            maxL1GasPricePerUnit:
              v3Options?.maxL1GasPricePerUnit ?? bufferedGasPrice,
          };

          txOptions = await this.prepareV3TransactionOptions(dynamicOptions);
        } else {
          // If we couldn't extract gas price, use provided options or default
          txOptions = await this.prepareV3TransactionOptions(v3Options);
        }
      }

      // Execute the multicall
      const { transaction_hash } = await this.account.execute(
        compiledCalls,
        txOptions
      );

      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(transaction_hash, {
        retryInterval: 1000,
      });

      return {
        success: receipt.isSuccess?.() ?? true,
        transactionHash: transaction_hash,
        receipt,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
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
      const compiledCalls = calls.map((call) => ({
        ...call,
        calldata: CallData.compile(call.calldata || []),
      }));

      // Prepare transaction options
      let txOptions = {};
      if (this.useV3Transactions) {
        // For fee estimation, use current network parameters and provided options
        txOptions = await this.prepareV3TransactionOptions(v3Options);
      }

      // Estimate fee for the multicall
      return this.account.estimateFee(compiledCalls, txOptions);
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Unknown error occurred");
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
      const compiledCalls = calls.map((call) => ({
        ...call,
        calldata: CallData.compile(call.calldata || []),
      }));

      // Execute all calls in parallel
      const results = await Promise.all(
        compiledCalls.map((call) => this.provider.callContract(call))
      );

      return results;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Unknown error occurred");
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
    this.gasPriceBufferMultiplier = multiplier;
  }

  /**
   * Enables or disables V3 transactions
   * @param enable - Whether to enable V3 transactions
   */
  public setUseV3Transactions(enable: boolean): void {
    this.useV3Transactions = enable;

    // Use the original private key from constructor
    const privateKey =
      this.account.signer instanceof Object &&
      "privateKey" in this.account.signer
        ? String(this.account.signer.privateKey)
        : "";

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
