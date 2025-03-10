import { getCategoryAddresses, isAddressOfType } from "./contracts";
import { executeQuery } from "./graphql";
import { getCurrentAgentId, getTokenBalance, normalizeAddress } from "./starknet";
import { GET_USER_LIQUIDITY_POSITIONS, GET_USER_STAKE_POSITIONS } from "./queries";

// Define types for competitive intelligence
export interface LiquidityPosition {
  id: string;
  pairAddress: string;
  userAddress: string;
  liquidity: string;
  depositsToken0: string;
  depositsToken1: string;
  withdrawalsToken0: string;
  withdrawalsToken1: string;
  usdValue: string;
  apyEarned: string;
  pair?: {
    token0Address: string;
    token1Address: string;
    reserve0: string;
    reserve1: string;
    totalSupply: string;
    tvlUsd: string;
  };
}

export interface StakePosition {
  id: string;
  reactorAddress: string;
  userAddress: string;
  stakedAmount: string;
  rewards: string;
  penaltyEndTime: string;
  rewardPerTokenPaid: string;
  reactor?: {
    lpTokenAddress: string;
    totalStaked: string;
    activeRewards: boolean;
    penaltyDuration: string;
    withdrawPenalty: string;
  };
}

export interface LiquidityPositionsResponse {
  liquidityPosition: LiquidityPosition[];
}

export interface StakePositionsResponse {
  userStake: StakePosition[];
}

export interface AgentIntelligence {
  agentId: string;
  address: string;
  he3Balance: string;
  resourceBalances: Record<string, string>;
  liquidityPositions: LiquidityPositionsResponse;
  stakePositions: StakePositionsResponse;
  error?: string;
}

export interface StrategicAnalysis {
  agentId: string;
  address: string;
  he3Balance: string;
  resourceFocus: string;
  pathPreference: string;
  liquidityStrategy: string;
  stakingStrategy: string;
  overallStrategy: string;
  counterStrategies: string[];
  error?: string;
}

/**
 * Safely convert a string to BigInt
 * @param value The string value to convert
 * @param defaultValue Optional default value if conversion fails
 * @returns The BigInt value or the default value
 */
export function safeBigIntConversion(value: string | undefined | null, defaultValue: bigint = 0n): bigint {
  if (!value) return defaultValue;
  
  try {
    return BigInt(value);
  } catch (error) {
    console.error(`Error converting ${value} to BigInt:`, error);
    return defaultValue;
  }
}

/**
 * Analyzes an agent's resource balances to determine their resource focus
 * @param resourceBalances Record of resource balances
 * @returns A string describing the agent's resource focus
 */
export function analyzeResourceFocus(resourceBalances: Record<string, string>): string {
  try {
    // Convert balances to BigInt for comparison
    const balances: Record<string, bigint> = {};
    for (const [resource, balance] of Object.entries(resourceBalances)) {
      if (balance !== "Error") {
        balances[resource] = safeBigIntConversion(balance);
      }
    }
    
    // Check which resources have the highest balances
    const sortedResources = Object.entries(balances)
      .sort(([, a], [, b]) => a > b ? -1 : a < b ? 1 : 0)
      .map(([resource]) => resource);
    
    // Determine focus based on top resources
    if (sortedResources.length === 0) return "Unknown";
    
    const topResource = sortedResources[0];
    
    // Check for He3 focus
    if (topResource === "helium3" && balances["helium3"] > 0n) {
      return "He3 Accumulation";
    }
    
    // Check for intermediate resource focus
    if (["graphene", "yttrium"].includes(topResource)) {
      return `${topResource.charAt(0).toUpperCase() + topResource.slice(1)} Path Focus`;
    }
    
    // Check for base resource focus
    if (["carbon", "neodymium"].includes(topResource)) {
      return `${topResource.charAt(0).toUpperCase() + topResource.slice(1)} Stockpiling`;
    }
    
    // Default to balanced approach
    return "Balanced Resource Approach";
  } catch (error) {
    console.error("Error analyzing resource focus:", error);
    return "Analysis Error";
  }
}

/**
 * Analyzes an agent's path preference based on their resources and positions
 * @param resourceBalances Record of resource balances
 * @param liquidityPositions Liquidity positions data
 * @param stakePositions Staking positions data
 * @returns A string describing the agent's path preference
 */
export function analyzePathPreference(
  resourceBalances: Record<string, string>,
  liquidityPositions: any,
  stakePositions: any
): string {
  try {
    // Check resource balances for path indicators
    const graphenePathResources = ["carbon", "graphite", "graphene"];
    const yttriumPathResources = ["neodymium", "dysprosium", "yttrium"];
    
    let graphenePathScore = 0;
    let yttriumPathScore = 0;
    
    // Score based on resource balances
    for (const [resource, balance] of Object.entries(resourceBalances)) {
      if (balance === "Error") continue;
      
      const balanceValue = safeBigIntConversion(balance);
      if (balanceValue === 0n) continue;
      
      if (graphenePathResources.includes(resource)) {
        graphenePathScore += 1;
      }
      
      if (yttriumPathResources.includes(resource)) {
        yttriumPathScore += 1;
      }
    }
    
    // Score based on liquidity positions
    const positions = liquidityPositions?.liquidityPosition || [];
    for (const position of positions) {
      const pairAddress = position.pairAddress;
      
      // Check if this pair involves graphene path tokens
      if (
        isAddressOfType(pairAddress, 'lpPairs', 'carbon') ||
        isAddressOfType(pairAddress, 'lpPairs', 'graphite') ||
        isAddressOfType(pairAddress, 'lpPairs', 'graphene')
      ) {
        graphenePathScore += 2;
      }
      
      // Check if this pair involves yttrium path tokens
      if (
        isAddressOfType(pairAddress, 'lpPairs', 'neodymium') ||
        isAddressOfType(pairAddress, 'lpPairs', 'dysprosium') ||
        isAddressOfType(pairAddress, 'lpPairs', 'yttrium')
      ) {
        yttriumPathScore += 2;
      }
    }
    
    // Score based on stake positions
    const stakes = stakePositions?.userStake || [];
    for (const stake of stakes) {
      const reactorAddress = stake.reactorAddress;
      
      // Check if this reactor is for graphene path tokens
      if (
        isAddressOfType(reactorAddress, 'reactors', 'grp') ||
        isAddressOfType(reactorAddress, 'reactors', 'gph')
      ) {
        graphenePathScore += 3;
      }
      
      // Check if this reactor is for yttrium path tokens
      if (
        isAddressOfType(reactorAddress, 'reactors', 'dy') ||
        isAddressOfType(reactorAddress, 'reactors', 'y')
      ) {
        yttriumPathScore += 3;
      }
    }
    
    // Determine path preference
    if (graphenePathScore > yttriumPathScore * 2) {
      return "Strong Graphene Path Preference";
    } else if (graphenePathScore > yttriumPathScore) {
      return "Moderate Graphene Path Preference";
    } else if (yttriumPathScore > graphenePathScore * 2) {
      return "Strong Yttrium Path Preference";
    } else if (yttriumPathScore > graphenePathScore) {
      return "Moderate Yttrium Path Preference";
    } else {
      return "Balanced Path Approach";
    }
  } catch (error) {
    console.error("Error analyzing path preference:", error);
    return "Analysis Error";
  }
}

/**
 * Analyzes an agent's liquidity strategy based on their positions
 * @param liquidityPositions Liquidity positions data
 * @returns A string describing the agent's liquidity strategy
 */
export function analyzeLiquidityStrategy(liquidityPositions: any): string {
  try {
    const positions = liquidityPositions?.liquidityPosition || [];
    
    if (positions.length === 0) {
      return "No Liquidity Positions";
    }
    
    // Count positions by type
    let baseResourcePositions = 0;
    let intermediateResourcePositions = 0;
    let advancedResourcePositions = 0;
    
    for (const position of positions) {
      const pairAddress = position.pairAddress;
      
      // Check if this pair involves base resources
      if (
        isAddressOfType(pairAddress, 'lpPairs', 'carbon') ||
        isAddressOfType(pairAddress, 'lpPairs', 'neodymium')
      ) {
        baseResourcePositions += 1;
      } 
      // Check if this pair involves intermediate resources
      else if (
        isAddressOfType(pairAddress, 'lpPairs', 'graphite') ||
        isAddressOfType(pairAddress, 'lpPairs', 'dysprosium')
      ) {
        intermediateResourcePositions += 1;
      } 
      // Check if this pair involves advanced resources
      else if (
        isAddressOfType(pairAddress, 'lpPairs', 'graphene') ||
        isAddressOfType(pairAddress, 'lpPairs', 'yttrium') ||
        isAddressOfType(pairAddress, 'lpPairs', 'helium3')
      ) {
        advancedResourcePositions += 1;
      }
    }
    
    // Determine liquidity strategy
    if (advancedResourcePositions > intermediateResourcePositions && advancedResourcePositions > baseResourcePositions) {
      return "Advanced Resource Liquidity Focus";
    } else if (intermediateResourcePositions > baseResourcePositions) {
      return "Intermediate Resource Liquidity Focus";
    } else if (baseResourcePositions > 0) {
      return "Base Resource Liquidity Focus";
    } else {
      return "Diversified Liquidity Strategy";
    }
  } catch (error) {
    console.error("Error analyzing liquidity strategy:", error);
    return "Analysis Error";
  }
}

/**
 * Analyzes an agent's staking strategy based on their positions
 * @param stakePositions Staking positions data
 * @returns A string describing the agent's staking strategy
 */
export function analyzeStakingStrategy(stakePositions: any): string {
  try {
    const stakes = stakePositions?.userStake || [];
    
    if (stakes.length === 0) {
      return "No Staking Positions";
    }
    
    // Count stakes by type
    let baseResourceStakes = 0;
    let intermediateResourceStakes = 0;
    let advancedResourceStakes = 0;
    let he3SingleStake = 0;
    
    for (const stake of stakes) {
      const reactorAddress = stake.reactorAddress;
      
      // Check for base resource reactors
      if (
        isAddressOfType(reactorAddress, 'reactors', 'grp') ||
        isAddressOfType(reactorAddress, 'reactors', 'dy')
      ) {
        baseResourceStakes += 1;
      } 
      // Check for intermediate resource reactors
      else if (
        isAddressOfType(reactorAddress, 'reactors', 'gph') ||
        isAddressOfType(reactorAddress, 'reactors', 'y')
      ) {
        intermediateResourceStakes += 1;
      } 
      // Check for He3 production reactors
      else if (
        isAddressOfType(reactorAddress, 'reactors', 'he3') && 
        !isAddressOfType(reactorAddress, 'reactors', 'he3Stake')
      ) {
        advancedResourceStakes += 1;
      } 
      // Check for He3 single staking
      else if (
        isAddressOfType(reactorAddress, 'reactors', 'he3Stake')
      ) {
        he3SingleStake += 1;
      }
    }
    
    // Determine staking strategy
    if (he3SingleStake > 0) {
      return "He3 Single Stake Focus";
    } else if (advancedResourceStakes > intermediateResourceStakes && advancedResourceStakes > baseResourceStakes) {
      return "Advanced Resource Staking Focus";
    } else if (intermediateResourceStakes > baseResourceStakes) {
      return "Intermediate Resource Staking Focus";
    } else if (baseResourceStakes > 0) {
      return "Base Resource Staking Focus";
    } else {
      return "Diversified Staking Strategy";
    }
  } catch (error) {
    console.error("Error analyzing staking strategy:", error);
    return "Analysis Error";
  }
}

/**
 * Determines an agent's overall strategy based on their resources and positions
 * @param resourceBalances Record of resource balances
 * @param liquidityPositions Liquidity positions data
 * @param stakePositions Staking positions data
 * @param he3Balance He3 token balance
 * @returns A string describing the agent's overall strategy
 */
export function determineOverallStrategy(
  resourceBalances: Record<string, string>,
  liquidityPositions: any,
  stakePositions: any,
  he3Balance: string
): string {
  try {
    // Convert He3 balance to BigInt safely
    const he3BalanceValue = safeBigIntConversion(he3Balance);
    
    // Define thresholds for game stages
    const endGameThreshold = 800000000000000000000000n;
    const lateGameThreshold = 500000000000000000000000n;
    
    // Check if close to winning
    if (he3BalanceValue > endGameThreshold) {
      return "End Game - Final He3 Accumulation";
    }
    
    // Check if significant He3 accumulated
    if (he3BalanceValue > lateGameThreshold) {
      return "Late Game - He3 Acceleration";
    }
    
    // Check if intermediate resources are being produced
    const hasGraphene = resourceBalances["graphene"] && safeBigIntConversion(resourceBalances["graphene"]) > 0n;
    const hasYttrium = resourceBalances["yttrium"] && safeBigIntConversion(resourceBalances["yttrium"]) > 0n;
    
    if (hasGraphene && hasYttrium) {
      return "Mid Game - Dual Path Production";
    } else if (hasGraphene) {
      return "Mid Game - Graphene Path Focus";
    } else if (hasYttrium) {
      return "Mid Game - Yttrium Path Focus";
    }
    
    // Check liquidity positions
    const positions = liquidityPositions?.liquidityPosition || [];
    if (positions.length > 0) {
      return "Early Game - Resource Conversion Setup";
    }
    
    // Default to initial stage
    return "Early Game - Resource Accumulation";
  } catch (error) {
    console.error("Error determining overall strategy:", error);
    return "Analysis Error";
  }
}

/**
 * Suggests counter-strategies based on an agent's resources and positions
 * @param resourceBalances Record of resource balances
 * @param liquidityPositions Liquidity positions data
 * @param stakePositions Staking positions data
 * @param he3Balance He3 token balance
 * @returns An array of strings describing counter-strategies
 */
export function suggestCounterStrategies(
  resourceBalances: Record<string, string>,
  liquidityPositions: any,
  stakePositions: any,
  he3Balance: string
): string[] {
  try {
    const strategies: string[] = [];
    
    // Define thresholds for game stages
    const endGameThreshold = 800000000000000000000000n;
    const lateGameThreshold = 500000000000000000000000n;
    
    // Convert He3 balance to BigInt safely
    const he3BalanceValue = safeBigIntConversion(he3Balance);
    
    // Counter strategies for different game stages
    if (he3BalanceValue > endGameThreshold) {
      // Counter end game strategy
      strategies.push("Accelerate He3 production to catch up");
      strategies.push("Focus exclusively on He3 single staking");
    } else if (he3BalanceValue > lateGameThreshold) {
      // Counter late game strategy
      strategies.push("Optimize He3 production path");
      strategies.push("Balance between He3 single staking and GPH-Y liquidity");
    } else {
      // Counter early/mid game strategies
      
      // Analyze path preference
      const pathPreference = analyzePathPreference(resourceBalances, liquidityPositions, stakePositions);
      
      if (pathPreference.includes("Graphene")) {
        strategies.push("Focus on Yttrium path to avoid competition");
        strategies.push("Secure Neodymium and Dysprosium resources");
      } else if (pathPreference.includes("Yttrium")) {
        strategies.push("Focus on Graphene path to avoid competition");
        strategies.push("Secure Carbon and Graphite resources");
      } else {
        strategies.push("Specialize in one path for efficiency");
      }
      
      // Analyze liquidity strategy
      const liquidityStrategy = analyzeLiquidityStrategy(liquidityPositions);
      
      if (liquidityStrategy.includes("Base Resource")) {
        strategies.push("Focus on intermediate and advanced resource liquidity");
      } else if (liquidityStrategy.includes("Advanced Resource")) {
        strategies.push("Ensure base resource supply chain is secure");
      }
    }
    
    return strategies;
  } catch (error) {
    console.error("Error suggesting counter strategies:", error);
    return ["Analysis Error"];
  }
}

/**
 * Gets competitive intelligence for all agents
 * @returns A record of agent IDs to their competitive intelligence
 */
export async function getCompetitiveIntelligence(): Promise<Record<string, AgentIntelligence>> {
  try {
    // Get all agent addresses
    const agentAddresses = getCategoryAddresses('agents');
    
    // Get current agent's ID and address
    const currentAgentId = getCurrentAgentId();
    const currentAgentAddress = agentAddresses[currentAgentId];
    
    if (!currentAgentAddress) {
      throw new Error(`Current agent address not found for ID: ${currentAgentId}`);
    }
    
    // Get He3 token address
    const resourceAddresses = getCategoryAddresses('resources');
    const he3Address = resourceAddresses['helium3'];
    
    if (!he3Address) {
      throw new Error("He3 token address not found");
    }
    
    // Prepare data structure for competitive intelligence
    const competitiveIntelligence: Record<string, AgentIntelligence> = {};
    
    // For each agent (except current one), gather intelligence
    for (const [agentId, agentAddress] of Object.entries(agentAddresses)) {
      // Skip current agent
      if (agentId === currentAgentId) continue;
      
      try {
        // Get agent's He3 balance
        const he3Balance = await getTokenBalance(he3Address, agentAddress);
        
        // Get agent's resource balances
        const resourceBalances: Record<string, string> = {};
        for (const [resourceName, resourceAddress] of Object.entries(resourceAddresses)) {
          try {
            const balance = await getTokenBalance(resourceAddress, agentAddress);
            resourceBalances[resourceName] = balance.toString();
          } catch (error) {
            console.error(`Failed to get ${resourceName} balance for agent ${agentId}:`, error);
            resourceBalances[resourceName] = "Error";
          }
        }
        
        // Get agent's liquidity positions
        const liquidityPositionsResult = await executeQuery<LiquidityPositionsResponse>(GET_USER_LIQUIDITY_POSITIONS, {
          userAddress: normalizeAddress(agentAddress)
        });
        
        // Get agent's stake positions
        const stakePositionsResult = await executeQuery<StakePositionsResponse>(GET_USER_STAKE_POSITIONS, {
          userAddress: normalizeAddress(agentAddress)
        });
        
        // Store all intelligence for this agent
        competitiveIntelligence[agentId] = {
          agentId,
          address: agentAddress,
          he3Balance: he3Balance.toString(),
          resourceBalances,
          liquidityPositions: liquidityPositionsResult,
          stakePositions: stakePositionsResult
        };
      } catch (error) {
        console.error(`Failed to get competitive intelligence for agent ${agentId}:`, error);
        competitiveIntelligence[agentId] = {
          agentId,
          address: agentAddress,
          he3Balance: "0",
          resourceBalances: {},
          liquidityPositions: { liquidityPosition: [] },
          stakePositions: { userStake: [] },
          error: (error as Error).message || "Failed to get competitive intelligence"
        };
      }
    }
    
    return competitiveIntelligence;
  } catch (error) {
    console.error('Failed to get competitive intelligence:', error);
    throw error;
  }
}

/**
 * Analyzes strategies for all competitors
 * @param competitiveIntelligence Record of agent IDs to their competitive intelligence
 * @returns A record of agent IDs to their strategic analysis
 */
export async function analyzeCompetitorStrategies(
  competitiveIntelligence: Record<string, AgentIntelligence>
): Promise<Record<string, StrategicAnalysis>> {
  try {
    // Analyze strategies for each competitor
    const strategicAnalysis: Record<string, StrategicAnalysis> = {};
    
    for (const [agentId, intelligence] of Object.entries(competitiveIntelligence)) {
      try {
        // Skip if there was an error getting intelligence for this agent
        if (intelligence.error) continue;
        
        const analysis: StrategicAnalysis = {
          agentId,
          address: intelligence.address,
          he3Balance: intelligence.he3Balance,
          
          // Analyze resource focus
          resourceFocus: analyzeResourceFocus(intelligence.resourceBalances),
          
          // Analyze path preference (Graphene vs Yttrium)
          pathPreference: analyzePathPreference(
            intelligence.resourceBalances, 
            intelligence.liquidityPositions, 
            intelligence.stakePositions
          ),
          
          // Analyze liquidity strategy
          liquidityStrategy: analyzeLiquidityStrategy(intelligence.liquidityPositions),
          
          // Analyze staking strategy
          stakingStrategy: analyzeStakingStrategy(intelligence.stakePositions),
          
          // Determine overall strategy
          overallStrategy: determineOverallStrategy(
            intelligence.resourceBalances,
            intelligence.liquidityPositions,
            intelligence.stakePositions,
            intelligence.he3Balance
          ),
          
          // Suggest counter-strategies
          counterStrategies: suggestCounterStrategies(
            intelligence.resourceBalances,
            intelligence.liquidityPositions,
            intelligence.stakePositions,
            intelligence.he3Balance
          )
        };
        
        strategicAnalysis[agentId] = analysis;
      } catch (error) {
        console.error(`Failed to analyze strategy for agent ${agentId}:`, error);
        strategicAnalysis[agentId] = {
          agentId,
          address: intelligence.address,
          he3Balance: intelligence.he3Balance || "0",
          resourceFocus: "Analysis Error",
          pathPreference: "Analysis Error",
          liquidityStrategy: "Analysis Error",
          stakingStrategy: "Analysis Error",
          overallStrategy: "Analysis Error",
          counterStrategies: ["Analysis Error"],
          error: (error as Error).message || "Failed to analyze strategy"
        };
      }
    }
    
    return strategicAnalysis;
  } catch (error) {
    console.error('Failed to analyze competitor strategies:', error);
    throw error;
  }
}

/**
 * Ranks all agents by their He3 balance
 * @returns An array of agents sorted by He3 balance in descending order
 */
export async function rankAgentsByHe3(): Promise<Array<{agentId: string, address: string, he3Balance: string}>> {
  try {
    // Get all agent addresses
    const agentAddresses = getCategoryAddresses('agents');
    
    // Get He3 token address
    const he3Address = getCategoryAddresses('resources')['helium3'];
    
    if (!he3Address) {
      throw new Error("He3 token address not found");
    }
    
    // Query He3 balance for each agent
    const balances: Array<{agentId: string, address: string, he3Balance: string}> = [];
    
    for (const [agentId, agentAddress] of Object.entries(agentAddresses)) {
      try {
        const balance = await getTokenBalance(he3Address, agentAddress);
        
        balances.push({
          agentId,
          address: agentAddress,
          he3Balance: balance.toString()
        });
      } catch (error) {
        console.error(`Failed to get He3 balance for agent ${agentId}:`, error);
        balances.push({
          agentId,
          address: agentAddress,
          he3Balance: "Error"
        });
      }
    }
    
    // Sort agents by He3 balance in descending order
    return balances
      .filter(agent => agent.he3Balance !== "Error")
      .sort((a, b) => {
        const balanceA = BigInt(a.he3Balance);
        const balanceB = BigInt(b.he3Balance);
        return balanceB > balanceA ? 1 : balanceB < balanceA ? -1 : 0;
      });
  } catch (error) {
    console.error('Failed to rank agents by He3:', error);
    throw error;
  }
}

/**
 * Gets resource balances for a specific agent
 * @param agentAddress The address of the agent
 * @returns A record of resource names to balances
 */
export async function getAgentResourceBalances(agentAddress: string): Promise<Record<string, string>> {
  try {
    // Get all resource contract addresses
    const resourceAddresses = getCategoryAddresses('resources');
    
    // Query balances for each resource
    const balances: Record<string, string> = {};
    
    for (const [resourceName, resourceAddress] of Object.entries(resourceAddresses)) {
      try {
        const balance = await getTokenBalance(resourceAddress, agentAddress);
        balances[resourceName] = balance.toString();
      } catch (error) {
        console.error(`Failed to get ${resourceName} balance for ${agentAddress}:`, error);
        balances[resourceName] = "Error";
      }
    }
    
    return balances;
  } catch (error) {
    console.error(`Failed to get resource balances for agent ${agentAddress}:`, error);
    throw error;
  }
}

/**
 * Compares positions between two agents
 * @param currentAgentAddress The address of the current agent
 * @param targetAgentAddress The address of the target agent to compare with
 * @returns An object containing both agents' positions
 */
export async function compareAgentPositions(currentAgentAddress: string, targetAgentAddress: string) {
  try {
    // Get both agents' liquidity positions
    const [currentAgentLiquidityPositions, targetAgentLiquidityPositions] = await Promise.all([
      executeQuery(GET_USER_LIQUIDITY_POSITIONS, {
        userAddress: normalizeAddress(currentAgentAddress)
      }),
      executeQuery(GET_USER_LIQUIDITY_POSITIONS, {
        userAddress: normalizeAddress(targetAgentAddress)
      })
    ]);

    // Get both agents' stake positions
    const [currentAgentStakePositions, targetAgentStakePositions] = await Promise.all([
      executeQuery(GET_USER_STAKE_POSITIONS, {
        userAddress: normalizeAddress(currentAgentAddress)
      }),
      executeQuery(GET_USER_STAKE_POSITIONS, {
        userAddress: normalizeAddress(targetAgentAddress)
      })
    ]);

    return {
      currentAgent: {
        address: currentAgentAddress,
        liquidityPositions: currentAgentLiquidityPositions,
        stakePositions: currentAgentStakePositions
      },
      targetAgent: {
        address: targetAgentAddress,
        liquidityPositions: targetAgentLiquidityPositions,
        stakePositions: targetAgentStakePositions
      }
    };
  } catch (error) {
    console.error('Failed to compare agent positions:', error);
    throw error;
  }
} 