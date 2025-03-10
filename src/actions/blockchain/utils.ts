import { action } from "@daydreamsai/core";
import { z } from "zod";
import { convertToContractValue, starknetChain, formatTokenBalance, normalizeAddress, getAgentAddress, getTokenBalance } from "../../utils/starknet";
import { executeQuery } from "../../utils/graphql";
import { GET_USER_LIQUIDITY_POSITIONS, GET_USER_STAKE_POSITIONS } from "../../utils/queries";
import { getContractAddress } from "../../utils/contracts";

export const utilsActions = [
  action({
    name: "getERC20Balance",
    description: "Retrieves your current balance of any ERC20 token. Returns both the raw balance and a formatted balance assuming 18 decimal places. Note: Currently uses a fixed 18 decimals for formatting. Uses the standard ERC20 balanceOf() function and handles uint256 responses from Starknet contracts.",
    schema: z.object({
      tokenAddress: z.string().describe("The Starknet address of the ERC20 token contract to query"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const agentAddress = await getAgentAddress();
        const balance = await getTokenBalance(call.data.tokenAddress, agentAddress);

        // Convert the decimal balance to proper token decimals
        const rawBalance = BigInt(balance.toString());
        const adjustedBalance = formatTokenBalance(rawBalance);

        return {
          success: true,
          balance: adjustedBalance.toString(),
          tokenBaseUnitBalance: rawBalance.toString(),
          decimals: 18,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get ERC20 balance:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get ERC20 balance",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "toTokenBaseUnits",
    description: "Converts a human-readable token amount to its base unit representation by querying the token's decimals() function. Dynamically adjusts the conversion based on the actual number of decimals returned by the token contract. Handles uint256 responses from Starknet contracts.",
    schema: z.object({
      tokenAddress: z.string().describe("The Starknet address of the ERC20 token contract to query"),
      amount: z.string().describe("The amount of tokens to convert to base units"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Call the decimals function of the ERC20 contract
        const result = await starknetChain.read({
          contractAddress: call.data.tokenAddress,
          entrypoint: "decimals",
          calldata: []
        });
        const decimals = Number(result[0]);
        // Convert the amount to base units
        const baseUnits = convertToContractValue(call.data.amount, decimals);

        return {
          success: true,
          baseUnits: baseUnits.toString(),
          decimals: decimals,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to convert token amount to base units:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to convert token amount to base units",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "getGameResourceState",
    description: "Retrieves a comprehensive snapshot of a player's resource portfolio in the defi.space mining game. Returns detailed information about:\n\n" +
      "1. Base Resources:\n" +
      "   - wattDollar (wD): Primary currency for all liquidity pairs\n" +
      "   - Carbon (C): Raw material for Graphene production path\n" +
      "   - Neodymium (Nd): Raw material for Yttrium production path\n\n" +
      "2. Intermediate Resources:\n" +
      "   - Graphite (GRP) & Graphene (GPH): Products in Carbon path\n" +
      "   - Dysprosium (Dy) & Yttrium (Y): Products in Neodymium path\n\n" +
      "3. Final Resource:\n" +
      "   - Helium-3 (He3): Victory condition token (target: 1,000,000)\n\n" +
      "4. Liquidity Positions:\n" +
      "   - All active LP token balances\n" +
      "   - Historical deposits and withdrawals\n" +
      "   - Current USD value and APY metrics\n\n" +
      "5. Staking Positions:\n" +
      "   - Active reactor stakes\n" +
      "   - Pending rewards\n" +
      "   - Lock periods and penalties\n\n" +
      "Essential for monitoring progress towards victory condition and optimizing resource allocation strategy.",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"), // Useless but needed for the schema
    }),
    handler: async (call, ctx, agent) => {
      try {
        const agentAddress = await getAgentAddress();
        // Get all token balances using the new contract helper
        const tokenBalances = {
          // Base resources
          wattDollar: await getTokenBalance(getContractAddress('resources', 'wattDollar'), agentAddress),
          carbon: await getTokenBalance(getContractAddress('resources', 'carbon'), agentAddress),
          neodymium: await getTokenBalance(getContractAddress('resources', 'neodymium'), agentAddress),
          
          // Intermediate - Graphene path
          graphite: await getTokenBalance(getContractAddress('resources', 'graphite'), agentAddress),
          graphene: await getTokenBalance(getContractAddress('resources', 'graphene'), agentAddress),
          
          // Intermediate - Yttrium path
          dysprosium: await getTokenBalance(getContractAddress('resources', 'dysprosium'), agentAddress),
          yttrium: await getTokenBalance(getContractAddress('resources', 'yttrium'), agentAddress),
          
          // Final resource
          helium3: await getTokenBalance(getContractAddress('resources', 'helium3'), agentAddress),

          // LP Tokens
          lpTokens: {
            wdCarbon: await getTokenBalance(getContractAddress('lpPairs', 'wdCarbon'), agentAddress),
            wdGraphite: await getTokenBalance(getContractAddress('lpPairs', 'wdGraphite'), agentAddress),
            wdNeodymium: await getTokenBalance(getContractAddress('lpPairs', 'wdNeodymium'), agentAddress),
            wdDysprosium: await getTokenBalance(getContractAddress('lpPairs', 'wdDysprosium'), agentAddress),
            grapheneYttrium: await getTokenBalance(getContractAddress('lpPairs', 'grapheneYttrium'), agentAddress),
            wdHelium3: await getTokenBalance(getContractAddress('lpPairs', 'wdHelium3'), agentAddress)
          }
        };
        // Get all liquidity positions
        const liquidityPositions = await executeQuery(GET_USER_LIQUIDITY_POSITIONS, {
          userAddress: normalizeAddress(agentAddress)
        });
        // Get all staking positions
        const stakePositions = await executeQuery(GET_USER_STAKE_POSITIONS, {
          userAddress: normalizeAddress(agentAddress)
        });
        // Get pending rewards for each staking position
        const stakingPositionsWithRewards = await Promise.all(
          stakePositions.userStake.map(async (stake: any, index: number) => {
            // Get the reactor index from the reactor address
            const reactorAddress= stake.reactorAddress;
            
            // Get all reward tokens for this reactor
            const rewardTokensResponse = await starknetChain.read({
              contractAddress: reactorAddress,
              entrypoint: "get_reward_tokens",
              calldata: []
            });
            
            const rewardTokens = Array.isArray(rewardTokensResponse) ? rewardTokensResponse : [rewardTokensResponse];
            
            // Get pending rewards for each reward token
            const pendingRewards = await Promise.all(
              rewardTokens.map(async (rewardToken: string) => {
                const earnedResponse = await starknetChain.read({
                  contractAddress: reactorAddress,
                  entrypoint: "earned",
                  calldata: [
                    agentAddress,
                    rewardToken
                  ]
                });
                return {
                  tokenAddress: rewardToken,
                  amount: formatTokenBalance(BigInt(earnedResponse[0]))
                };
              })
            );
            return {
              reactorAddress: stake.reactorAddress,
              stakedAmount: stake.stakedAmount,
              rewards: stake.rewards,
              penaltyEndTime: stake.penaltyEndTime,
              rewardPerTokenPaid: stake.rewardPerTokenPaid,
              pendingRewards,
              reactorInfo: {
                lpTokenAddress: stake.reactor.lpTokenAddress,
                totalStaked: stake.reactor.totalStaked,
                activeRewards: stake.reactor.activeRewards,
                penaltyDuration: stake.reactor.penaltyDuration,
                withdrawPenalty: stake.reactor.withdrawPenalty
              },
            };
          })
        );
        const response = {
          success: true,
          result: {
            tokenBalances: {
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
            },
            liquidityPositions: liquidityPositions.liquidityPosition.map((pos: any) => ({
              pairAddress: pos.pairAddress,
              liquidity: pos.liquidity,
              depositsToken0: pos.depositsToken0,
              depositsToken1: pos.depositsToken1,
              withdrawalsToken0: pos.withdrawalsToken0,
              withdrawalsToken1: pos.withdrawalsToken1,
              usdValue: pos.usdValue,
              apyEarned: pos.apyEarned,
              pairInfo: {
                token0Address: pos.pair.token0Address,
                token1Address: pos.pair.token1Address,
                reserve0: pos.pair.reserve0,
                reserve1: pos.pair.reserve1,
                totalSupply: pos.pair.totalSupply,
                tvlUsd: pos.pair.tvlUsd
              }
            })),
            stakePositions: stakingPositionsWithRewards
          },
          timestamp: Date.now(),
        };
        return response;
      } catch (error) {
        console.error('[getGameResourceState] Error stack:', (error as Error).stack);
        return {
          success: false,
          error: (error as Error).message || "Failed to get player state",
          timestamp: Date.now(),
        };
      }
    },
  }),
];
