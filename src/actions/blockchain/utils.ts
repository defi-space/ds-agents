import { action } from "@daydreamsai/core";
import { z } from "zod";
import { convertToContractValue, starknetChain, formatTokenBalance, normalizeAddress, getAgentAddress, getTokenBalance } from "../../utils/starknet";
import { executeQuery } from "../../utils/graphql";
import { GET_AGENT_LIQUIDITY_POSITIONS, GET_AGENT_STAKE_POSITIONS, GET_GAME_SESSION_INDEX_BY_ADDRESS } from "../../utils/queries";
import { getContractAddress } from "../../utils/contracts";

// Define token address interface to fix type issues
interface TokenAddresses {
  wattDollar: string;
  carbon: string;
  neodymium: string;
  graphite: string;
  graphene: string;
  dysprosium: string;
  yttrium: string;
  helium3: string;
  lpTokens: {
    wdCarbon: string;
    wdGraphite: string;
    wdNeodymium: string;
    wdDysprosium: string;
    grapheneYttrium: string;
    wdHelium3: string;
  };
}

// Define interface for formatted token value
interface FormattedTokenValue {
  balance: string;
  tokenBaseUnitBalance: string;
}

// Define interface for formatted token balances
interface FormattedTokenBalances {
  wattDollar: FormattedTokenValue;
  carbon: FormattedTokenValue;
  neodymium: FormattedTokenValue;
  graphite: FormattedTokenValue;
  graphene: FormattedTokenValue;
  dysprosium: FormattedTokenValue;
  yttrium: FormattedTokenValue;
  helium3: FormattedTokenValue;
  lpTokens: {
    wdCarbon: FormattedTokenValue;
    wdGraphite: FormattedTokenValue;
    wdNeodymium: FormattedTokenValue;
    wdDysprosium: FormattedTokenValue;
    grapheneYttrium: FormattedTokenValue;
    wdHelium3: FormattedTokenValue;
  };
}

export const utilsActions = [
  action({
    name: "getERC20Balance",
    description: "Retrieves the current balance of any ERC20 token",
    instructions: "Use this action when an agent needs to check its balance of a specific token",
    schema: z.object({
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.tokenAddress) {
          return {
            success: false,
            message: "Cannot retrieve ERC20 balance: token address is missing",
            timestamp: Date.now()
          };
        }
        
        const tokenAddress = normalizeAddress(args.tokenAddress);
        const agentAddress = await getAgentAddress();
        
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot retrieve ERC20 balance: failed to get agent address",
            timestamp: Date.now()
          };
        }
        
        const balance = await getTokenBalance(tokenAddress, agentAddress);

        // Convert the decimal balance to proper token decimals
        const rawBalance = BigInt(balance.toString());
        const adjustedBalance = formatTokenBalance(rawBalance);

        return {
          success: true,
          message: `Current balance of token ${args.tokenAddress}: ${adjustedBalance.balance} (${rawBalance} base units)`,
          data: {
            formattedBalance: adjustedBalance.balance,
            tokenBaseUnitBalance: rawBalance.toString(),
            decimals: 18, // Default assumption
            tokenAddress: args.tokenAddress,
            holderAddress: agentAddress
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get ERC20 balance:', error);
        return {
          success: false,
          message: `Failed to retrieve ERC20 balance: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`ERC20 balance query failed:`, error);
      ctx.emit("erc20BalanceError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "toTokenBaseUnits",
    description: "Converts a human-readable token amount to its base unit representation",
    instructions: "Use this action when an agent needs to convert a decimal token amount to the raw base units required for contract interactions",
    schema: z.object({
      tokenAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address (must be a valid hex address starting with 0x)"),
      amount: z.string().describe("Amount of tokens to convert as a string (e.g., '1.5' or '100')")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.tokenAddress) {
          return {
            success: false,
            message: "Cannot convert to base units: token address is missing",
            timestamp: Date.now()
          };
        }
        
        if (!args.amount) {
          return {
            success: false,
            message: "Cannot convert to base units: amount is missing",
            timestamp: Date.now()
          };
        }
        
        // Validate amount format (should be a valid number)
        if (isNaN(parseFloat(args.amount))) {
          return {
            success: false,
            message: `Cannot convert to base units: '${args.amount}' is not a valid number`,
            timestamp: Date.now()
          };
        }
        
        const tokenAddress = normalizeAddress(args.tokenAddress);
        
        // Call the decimals function of the ERC20 contract
        const result = await starknetChain.read({
          contractAddress: tokenAddress,
          entrypoint: "decimals",
          calldata: []
        });
        
        const decimals = Number(result[0]);
        
        // Convert the amount to base units
        const baseUnits = convertToContractValue(args.amount, decimals);

        return {
          success: true,
          message: `Converted ${args.amount} tokens to ${baseUnits.toString()} base units (${decimals} decimals)`,
          data: {
            baseUnits: baseUnits.toString(),
            decimals: decimals,
            originalAmount: args.amount,
            tokenAddress: args.tokenAddress
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to convert token amount to base units:', error);
        return {
          success: false,
          message: `Failed to convert to base units: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Token conversion failed:`, error);
      ctx.emit("tokenConversionError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "getGameResourceState",
    description: "Retrieves a comprehensive snapshot of an agent's resource portfolio",
    instructions: "Use this action when an agent needs to see all its token balances, liquidity positions, and staking positions at once",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const agentAddress = await getAgentAddress();
        
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot retrieve game resource state: failed to get agent address",
            timestamp: Date.now()
          };
        }
        
        // Get the game session ID
        const sessionAddress = getContractAddress('gameSession', 'current');
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot retrieve game resource state: failed to get game session address",
            timestamp: Date.now()
          };
        }
        
        const normalizedSessionAddress = normalizeAddress(sessionAddress);
        
        const sessionResult = await executeQuery(GET_GAME_SESSION_INDEX_BY_ADDRESS, {
          address: normalizedSessionAddress
        });
        
        if (!sessionResult?.gameSession || !sessionResult.gameSession[0].gameSessionIndex) {
          return {
            success: false,
            message: `Cannot retrieve game resource state: no game session index found for address ${sessionAddress}`,
            timestamp: Date.now()
          };
        }
        
        const gameSessionId = sessionResult.gameSession[0].gameSessionIndex;
        // Get all token balances using the contract helper
        const tokenAddresses: TokenAddresses = {
          // Base resources
          wattDollar: getContractAddress('resources', 'wattDollar'),
          carbon: getContractAddress('resources', 'carbon'),
          neodymium: getContractAddress('resources', 'neodymium'),
          
          // Intermediate - Graphene path
          graphite: getContractAddress('resources', 'graphite'),
          graphene: getContractAddress('resources', 'graphene'),
          
          // Intermediate - Yttrium path
          dysprosium: getContractAddress('resources', 'dysprosium'),
          yttrium: getContractAddress('resources', 'yttrium'),
          
          // Final resource
          helium3: getContractAddress('resources', 'helium3'),

          // LP Tokens
          lpTokens: {
            wdCarbon: getContractAddress('lpPairs', 'wdCarbon'),
            wdGraphite: getContractAddress('lpPairs', 'wdGraphite'),
            wdNeodymium: getContractAddress('lpPairs', 'wdNeodymium'),
            wdDysprosium: getContractAddress('lpPairs', 'wdDysprosium'),
            grapheneYttrium: getContractAddress('lpPairs', 'grapheneYttrium'),
            wdHelium3: getContractAddress('lpPairs', 'wdHelium3')
          }
        };
        
        // Validate all token addresses using type-safe approach
        const missingAddresses: string[] = [];
        const resourceKeys: (keyof Omit<TokenAddresses, 'lpTokens'>)[] = [
          'wattDollar', 'carbon', 'neodymium', 'graphite', 'graphene',
          'dysprosium', 'yttrium', 'helium3'
        ];
        
        for (const key of resourceKeys) {
          if (!tokenAddresses[key]) {
            missingAddresses.push(key);
          }
        }
        
        const lpKeys: (keyof TokenAddresses['lpTokens'])[] = [
          'wdCarbon', 'wdGraphite', 'wdNeodymium', 
          'wdDysprosium', 'grapheneYttrium', 'wdHelium3'
        ];
        
        for (const key of lpKeys) {
          if (!tokenAddresses.lpTokens[key]) {
            missingAddresses.push(`lpTokens.${key}`);
          }
        }
        
        if (missingAddresses.length > 0) {
          return {
            success: false,
            message: `Cannot retrieve game resource state: missing contract addresses for: ${missingAddresses.join(', ')}`,
            timestamp: Date.now()
          };
        }
        
        // Use Promise.all to fetch all token balances concurrently
        const fetchBalancePromises = {
          // Base resources
          wattDollar: getTokenBalance(tokenAddresses.wattDollar, agentAddress),
          carbon: getTokenBalance(tokenAddresses.carbon, agentAddress),
          neodymium: getTokenBalance(tokenAddresses.neodymium, agentAddress),
          
          // Intermediate - Graphene path
          graphite: getTokenBalance(tokenAddresses.graphite, agentAddress),
          graphene: getTokenBalance(tokenAddresses.graphene, agentAddress),
          
          // Intermediate - Yttrium path
          dysprosium: getTokenBalance(tokenAddresses.dysprosium, agentAddress),
          yttrium: getTokenBalance(tokenAddresses.yttrium, agentAddress),
          
          // Final resource
          helium3: getTokenBalance(tokenAddresses.helium3, agentAddress),

          // LP Tokens
          lpTokens: {
            wdCarbon: getTokenBalance(tokenAddresses.lpTokens.wdCarbon, agentAddress),
            wdGraphite: getTokenBalance(tokenAddresses.lpTokens.wdGraphite, agentAddress),
            wdNeodymium: getTokenBalance(tokenAddresses.lpTokens.wdNeodymium, agentAddress),
            wdDysprosium: getTokenBalance(tokenAddresses.lpTokens.wdDysprosium, agentAddress),
            grapheneYttrium: getTokenBalance(tokenAddresses.lpTokens.grapheneYttrium, agentAddress),
            wdHelium3: getTokenBalance(tokenAddresses.lpTokens.wdHelium3, agentAddress)
          }
        };
        
        // Resolve all promises
        const [
          wattDollar, 
          carbon, 
          neodymium, 
          graphite, 
          graphene, 
          dysprosium, 
          yttrium, 
          helium3, 
          wdCarbon, 
          wdGraphite, 
          wdNeodymium, 
          wdDysprosium, 
          grapheneYttrium, 
          wdHelium3
        ] = await Promise.all([
          fetchBalancePromises.wattDollar,
          fetchBalancePromises.carbon,
          fetchBalancePromises.neodymium,
          fetchBalancePromises.graphite,
          fetchBalancePromises.graphene,
          fetchBalancePromises.dysprosium,
          fetchBalancePromises.yttrium,
          fetchBalancePromises.helium3,
          fetchBalancePromises.lpTokens.wdCarbon,
          fetchBalancePromises.lpTokens.wdGraphite,
          fetchBalancePromises.lpTokens.wdNeodymium,
          fetchBalancePromises.lpTokens.wdDysprosium,
          fetchBalancePromises.lpTokens.grapheneYttrium,
          fetchBalancePromises.lpTokens.wdHelium3
        ]);
        
        const tokenBalances = {
          // Base resources
          wattDollar,
          carbon,
          neodymium,
          
          // Intermediate - Graphene path
          graphite,
          graphene,
          
          // Intermediate - Yttrium path
          dysprosium,
          yttrium,
          
          // Final resource
          helium3,

          // LP Tokens
          lpTokens: {
            wdCarbon,
            wdGraphite,
            wdNeodymium,
            wdDysprosium,
            grapheneYttrium,
            wdHelium3
          }
        };
        
        // Get all liquidity positions
        const liquidityPositions = await executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
          agentAddress: normalizeAddress(agentAddress),
          gameSessionId: gameSessionId
        });
        
        // Get all staking positions
        const stakePositions = await executeQuery(GET_AGENT_STAKE_POSITIONS, {
          agentAddress: normalizeAddress(agentAddress),
          gameSessionId: gameSessionId
        });
        
        // Process stake positions including rewardStates with lastPendingRewards
        const stakingPositionsWithRewards = stakePositions?.agentStake && Array.isArray(stakePositions.agentStake) 
          ? stakePositions.agentStake.map((stake: any) => {
              // Extract rewardStates with lastPendingRewards if available
              const rewardStates = stake.rewardStates || [];
              
              // Format the reward states for easier consumption
              const formattedRewardStates = rewardStates.map((rewardState: any) => ({
                farmAddress: stake.farmAddress,
                rewardTokenAddress: rewardState.rewardTokenAddress,
                lastPendingRewards: rewardState.lastPendingRewards,
                rewardPerTokenPaid: rewardState.rewardPerTokenPaid
              }));
              
              return {
                farmAddress: stake.farmAddress,
                stakedAmount: stake.stakedAmount,
                rewards: stake.rewards,
                penaltyEndTime: stake.penaltyEndTime,
                rewardPerTokenPaid: stake.rewardPerTokenPaid,
                rewardStates: formattedRewardStates,
                farmInfo: stake.farm ? {
                  lpTokenAddress: stake.farm.lpTokenAddress,
                  totalStaked: stake.farm.totalStaked,
                  activeRewards: stake.farm.activeRewards,
                  penaltyDuration: stake.farm.penaltyDuration,
                  withdrawPenalty: stake.farm.withdrawPenalty,
                  gameSessionId: stake.farm.gameSessionId
                } : null
              };
            })
          : [];
        
        // Format the response data
        const formattedTokenBalances: FormattedTokenBalances = {
              // Base resources
              wattDollar: formatTokenBalance(tokenBalances.wattDollar),
              carbon: formatTokenBalance(tokenBalances.carbon),
              neodymium: formatTokenBalance(tokenBalances.neodymium),
              // Intermediate - Graphene path
              graphite: formatTokenBalance(tokenBalances.graphite),
              graphene: formatTokenBalance(tokenBalances.graphene),
              // Intermediate - Yttrium path
              dysprosium: formatTokenBalance(tokenBalances.dysprosium),
              yttrium: formatTokenBalance(tokenBalances.yttrium),
              // Final resource
              helium3: formatTokenBalance(tokenBalances.helium3),
              // LP Tokens
              lpTokens: {
                wdCarbon: formatTokenBalance(tokenBalances.lpTokens.wdCarbon),
                wdGraphite: formatTokenBalance(tokenBalances.lpTokens.wdGraphite),
                wdNeodymium: formatTokenBalance(tokenBalances.lpTokens.wdNeodymium),
                wdDysprosium: formatTokenBalance(tokenBalances.lpTokens.wdDysprosium),
                grapheneYttrium: formatTokenBalance(tokenBalances.lpTokens.grapheneYttrium),
                wdHelium3: formatTokenBalance(tokenBalances.lpTokens.wdHelium3)
              }
        };
        
        const formattedLiquidityPositions = liquidityPositions?.liquidityPosition 
          ? liquidityPositions.liquidityPosition.map((pos: any) => ({
              pairAddress: pos.pairAddress,
              liquidity: pos.liquidity,
              depositsToken0: pos.depositsToken0,
              depositsToken1: pos.depositsToken1,
              withdrawalsToken0: pos.withdrawalsToken0,
              withdrawalsToken1: pos.withdrawalsToken1,
              pairInfo: pos.pair ? {
                token0Address: pos.pair.token0Address,
                token1Address: pos.pair.token1Address,
                reserve0: pos.pair.reserve0,
                reserve1: pos.pair.reserve1,
                totalSupply: pos.pair.totalSupply,
                gameSessionId: pos.pair.gameSessionId
              } : null
            }))
          : [];
        
        // Calculate game progress stats using the helper function
        const parseFormattedNumber = (value: string): number => {
          // Remove commas and convert to number
          return parseFloat(value.replace(/,/g, ''));
        };
        
        // Get the He3 amount as a number
        const helium3Value = formattedTokenBalances.helium3.balance;
        const helium3Amount = parseFormattedNumber(helium3Value);
          
        const progressStats = {
          he3Goal: {
            current: formattedTokenBalances.helium3.balance,
            target: "7,000,000",
            progressPercentage: helium3Amount / 7000000 * 100
          },
          activeStakes: stakingPositionsWithRewards.length,
          gameSessionId: gameSessionId
        };

        return {
          success: true,
          message: `Retrieved game resource state: ${progressStats.he3Goal.progressPercentage.toFixed(2)}% towards He3 goal with ${progressStats.activeStakes} active stakes and ${formattedLiquidityPositions.length} liquidity positions`,
          data: {
            tokenBalances: formattedTokenBalances,
            rawTokenBalances: {
              wattDollar: tokenBalances.wattDollar.toString(),
              carbon: tokenBalances.carbon.toString(),
              neodymium: tokenBalances.neodymium.toString(),
              graphite: tokenBalances.graphite.toString(),
              graphene: tokenBalances.graphene.toString(),
              dysprosium: tokenBalances.dysprosium.toString(),
              yttrium: tokenBalances.yttrium.toString(),
              helium3: tokenBalances.helium3.toString(),
              lpTokens: {
                wdCarbon: tokenBalances.lpTokens.wdCarbon.toString(),
                wdGraphite: tokenBalances.lpTokens.wdGraphite.toString(),
                wdNeodymium: tokenBalances.lpTokens.wdNeodymium.toString(),
                wdDysprosium: tokenBalances.lpTokens.wdDysprosium.toString(),
                grapheneYttrium: tokenBalances.lpTokens.grapheneYttrium.toString(),
                wdHelium3: tokenBalances.lpTokens.wdHelium3.toString()
              }
            },
            liquidityPositions: formattedLiquidityPositions,
            stakePositions: stakingPositionsWithRewards,
            progressStats,
            gameSessionId: gameSessionId
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('[getGameResourceState] Error:', error);
        console.error('[getGameResourceState] Error stack:', (error as Error).stack);
        return {
          success: false,
          message: `Failed to retrieve game resource state: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Game resource state query failed:`, error);
      ctx.emit("gameResourceStateError", { action: ctx.call.name, error: error.message });
    }
  }),
];
