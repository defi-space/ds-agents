import {
  getAgentAddress,
  getResourceAddress,
  getAvailableAgents,
  availableTokenSymbols,
} from "./contracts";
import type { TokenSymbol } from "./contracts";
import { executeQuery, getGameSessionId, normalizeAddress } from "./graphql";
import { getCurrentAgentId, getTokenBalance } from "./starknet";
import { GET_AGENT_LIQUIDITY_POSITIONS, GET_AGENT_FARM_POSITIONS } from "./queries";

/**
 * Complete data about an agent including balances and activity
 */
export interface AgentData {
  agentId: string; // Agent identifier
  address: string; // Agent's blockchain address
  resourceBalances: Record<TokenSymbol, string>; // All resource token balances
  liquidityPositions: number; // Count of liquidity positions
  farmPositions: number; // Count of farm positions
  totalResourceValue: string; // Sum of all resource balances
  he3Balance: string; // He3 balance (most important resource)
  dominantResource: TokenSymbol | null; // Resource with highest balance
  gameStage: "early" | "mid" | "advanced" | "endgame"; // Current game progression stage
  strategyFocus: "carbon_path" | "neodymium_path" | "balanced" | "he3_farming"; // Primary strategy
  pathProgression: {
    // Progress on each resource path
    carbonPath: number; // 0-4 (C -> GRP -> GPH -> GPH/Y -> He3)
    neodymiumPath: number; // 0-4 (Nd -> Dy -> Y -> GPH/Y -> He3)
    he3Farming: number; // 0-2 (He3 production -> He3 staking -> wD farming)
  };
}

/**
 * Simple ranking entry for He3 leaderboard
 */
export interface AgentRanking {
  agentId: string; // Agent identifier
  he3Balance: string; // He3 balance as string
  rank: number; // Position in ranking (1 = first place)
  progressToGoal: number; // Percentage toward 7M He3 goal (0-100)
}

/**
 * Head-to-head comparison between two agents
 */
export interface AgentComparison {
  agent1: AgentData; // First agent's complete data
  agent2: AgentData; // Second agent's complete data
  winner: {
    // Who wins in each category
    he3: string; // Agent with more He3
    resources: string; // Agent with more total resources
    activity: string; // Agent with more positions
    strategy: string; // Agent with better strategic position
    overall: string; // Overall winner based on weighted score
  };
  differences: string[]; // Human-readable differences between agents
  strategicAnalysis: {
    // Deep strategic comparison
    pathCompletion: string; // Who has better path completion
    diversification: string; // Who has better risk spread
    endgameReadiness: string; // Who is closer to winning
  };
}

/**
 * Get comprehensive data about a specific agent
 * This is the main function that fetches all agent information needed for analysis
 *
 * @param agentId - The agent identifier to analyze
 * @returns Complete agent data including balances and positions
 */
export async function getAgentData(agentId: string): Promise<AgentData> {
  // Get agent's blockchain address and current game session
  const agentAddress = getAgentAddress(agentId);
  const gameSessionId = await getGameSessionId();

  // Initialize tracking variables for resource analysis
  const resourceBalances: Record<TokenSymbol, string> = {} as Record<TokenSymbol, string>;
  let totalResourceValue = 0n; // Sum of all resource balances
  let dominantResource: TokenSymbol | null = null; // Resource with highest balance
  let maxBalance = 0n; // Highest individual resource balance

  // Loop through all available resource tokens to get balances
  for (const symbol of availableTokenSymbols) {
    try {
      // Get the contract address for this resource token
      const resourceAddress = getResourceAddress(symbol);
      // Query the agent's balance for this specific resource
      const balance = await getTokenBalance(resourceAddress, agentAddress);
      const balanceValue = BigInt(balance.toString());

      // Store the balance and add to total value
      resourceBalances[symbol] = balance.toString();
      totalResourceValue += balanceValue;

      // Track which resource has the highest balance (dominant resource)
      if (balanceValue > maxBalance) {
        maxBalance = balanceValue;
        dominantResource = symbol;
      }
    } catch {
      // If we can't get a balance, default to 0 (graceful degradation)
      resourceBalances[symbol] = "0";
    }
  }

  // Get count of active positions (parallel queries for efficiency)
  const [liquidityPositions, farmPositions] = await Promise.all([
    // Query all liquidity pool positions for this agent
    executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
      agentAddress: normalizeAddress(agentAddress),
      gameSessionId,
    }),
    // Query all farm staking positions for this agent
    executeQuery(GET_AGENT_FARM_POSITIONS, {
      agentAddress: normalizeAddress(agentAddress),
      gameSessionId,
    }),
  ]);

  // Analyze game progression and strategy
  const gameStage = determineGameStage(resourceBalances);
  const strategyFocus = analyzeStrategyFocus(resourceBalances);
  const pathProgression = analyzePathProgression(resourceBalances);

  // Return complete agent data structure
  return {
    agentId,
    address: agentAddress,
    resourceBalances,
    liquidityPositions: liquidityPositions?.liquidityPosition?.length || 0,
    farmPositions: farmPositions?.agentStake?.length || 0,
    totalResourceValue: totalResourceValue.toString(),
    he3Balance: resourceBalances.He3, // He3 is the most important resource
    dominantResource,
    gameStage,
    strategyFocus,
    pathProgression,
  };
}

/**
 * Determine what stage of the game an agent is in based on their resources
 * Game stages based on DS context resource progression paths
 */
function determineGameStage(
  balances: Record<TokenSymbol, string>
): "early" | "mid" | "advanced" | "endgame" {
  const he3 = BigInt(balances.He3 || "0");
  const gph = BigInt(balances.GPH || "0");
  const y = BigInt(balances.Y || "0");
  const grp = BigInt(balances.GRP || "0");
  const dy = BigInt(balances.Dy || "0");

  // Endgame: Has significant He3 (>100,000 He3 tokens, approaching 7M goal)
  if (he3 > 100000000000000000000000n) return "endgame";

  // Advanced: Has both GPH and Y (can farm He3)
  if (gph > 0n && y > 0n) return "advanced";

  // Mid: Has intermediate resources (GRP or Dy)
  if (grp > 0n || dy > 0n) return "mid";

  // Early: Only has base resources or just starting
  return "early";
}

/**
 * Analyze which strategy path the agent is focusing on
 * Based on DS context resource accumulation paths
 */
function analyzeStrategyFocus(
  balances: Record<TokenSymbol, string>
): "carbon_path" | "neodymium_path" | "balanced" | "he3_farming" {
  const he3 = BigInt(balances.He3 || "0");
  const carbonPath =
    BigInt(balances.C || "0") + BigInt(balances.GRP || "0") + BigInt(balances.GPH || "0");
  const neodymiumPath =
    BigInt(balances.Nd || "0") + BigInt(balances.Dy || "0") + BigInt(balances.Y || "0");

  // He3 farming focus: Already has significant He3
  if (he3 > 5000000000000000000000n) return "he3_farming";

  // Calculate path preferences
  const totalPathValue = carbonPath + neodymiumPath;
  if (totalPathValue === 0n) return "balanced";

  const carbonPercentage = Number((carbonPath * 100n) / totalPathValue);
  const neodymiumPercentage = Number((neodymiumPath * 100n) / totalPathValue);

  // Focused strategies (>70% in one path)
  if (carbonPercentage > 70) return "carbon_path";
  if (neodymiumPercentage > 70) return "neodymium_path";

  return "balanced";
}

/**
 * Analyze progression along each resource accumulation path
 * Based on DS context progression: Base -> Intermediate -> Advanced -> Final
 */
function analyzePathProgression(balances: Record<TokenSymbol, string>): {
  carbonPath: number;
  neodymiumPath: number;
  he3Farming: number;
} {
  // Carbon Path: C -> GRP -> GPH -> GPH/Y -> He3
  let carbonPath = 0;
  if (BigInt(balances.C || "0") > 0n) carbonPath = 1; // Has Carbon
  if (BigInt(balances.GRP || "0") > 0n) carbonPath = 2; // Has Graphite
  if (BigInt(balances.GPH || "0") > 0n) carbonPath = 3; // Has Graphene
  if (BigInt(balances.He3 || "0") > 0n) carbonPath = 4; // Producing He3

  // Neodymium Path: Nd -> Dy -> Y -> GPH/Y -> He3
  let neodymiumPath = 0;
  if (BigInt(balances.Nd || "0") > 0n) neodymiumPath = 1; // Has Neodymium
  if (BigInt(balances.Dy || "0") > 0n) neodymiumPath = 2; // Has Dysprosium
  if (BigInt(balances.Y || "0") > 0n) neodymiumPath = 3; // Has Yttrium
  if (BigInt(balances.He3 || "0") > 0n) neodymiumPath = 4; // Producing He3

  // He3 Farming: Basic He3 -> He3 Staking -> wD Farming
  let he3Farming = 0;
  const he3Balance = BigInt(balances.He3 || "0");
  if (he3Balance > 0n) he3Farming = 1; // Has He3
  if (he3Balance > 10000000000000000000n) he3Farming = 2; // Can farm more He3/wD

  return { carbonPath, neodymiumPath, he3Farming };
}

/**
 * Rank all agents by their He3 balance (primary competition metric)
 * He3 is the victory condition - first to 7,000,000 He3 wins
 *
 * @returns Array of agents sorted by He3 balance (highest first)
 */
export async function rankAgentsByHe3(): Promise<AgentRanking[]> {
  // Get list of all available agents
  const agents = getAvailableAgents();
  const rankings: AgentRanking[] = [];

  // Victory condition: 7,000,000 He3 tokens
  const VICTORY_THRESHOLD = 7000000000000000000000000n; // 7M He3 in wei

  // Get He3 balance for each agent
  for (const agentId of agents) {
    try {
      // Get agent address and He3 token contract address
      const agentAddress = getAgentAddress(agentId);
      const he3Address = getResourceAddress("He3");
      // Query the agent's He3 balance
      const balance = await getTokenBalance(he3Address, agentAddress);
      const balanceBigInt = BigInt(balance.toString());

      // Calculate progress to victory (0-100%)
      const progressToGoal = Math.min(100, Number((balanceBigInt * 100n) / VICTORY_THRESHOLD));

      rankings.push({
        agentId,
        he3Balance: balance.toString(),
        rank: 0, // Will be assigned after sorting
        progressToGoal,
      });
    } catch {
      // If we can't get balance, assume 0 (graceful degradation)
      rankings.push({
        agentId,
        he3Balance: "0",
        rank: 0,
        progressToGoal: 0,
      });
    }
  }

  // Sort agents by He3 balance in descending order (highest first)
  rankings.sort((a, b) => {
    const balanceA = BigInt(a.he3Balance);
    const balanceB = BigInt(b.he3Balance);
    return balanceB > balanceA ? 1 : balanceB < balanceA ? -1 : 0;
  });

  // Assign rank numbers (1st place, 2nd place, etc.)
  rankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
  });

  return rankings;
}

/**
 * Compare two agents head-to-head across all metrics
 * Provides detailed analysis of who's winning in different areas
 * Enhanced with game-specific strategic analysis
 *
 * @param agentId1 - First agent to compare
 * @param agentId2 - Second agent to compare
 * @returns Detailed comparison with winners and strategic insights
 */
export async function compareAgents(agentId1: string, agentId2: string): Promise<AgentComparison> {
  // Get complete data for both agents (parallel for efficiency)
  const [agent1, agent2] = await Promise.all([getAgentData(agentId1), getAgentData(agentId2)]);

  // Convert string balances to BigInt for accurate comparison
  const he3_1 = BigInt(agent1.he3Balance);
  const he3_2 = BigInt(agent2.he3Balance);
  const resources_1 = BigInt(agent1.totalResourceValue);
  const resources_2 = BigInt(agent2.totalResourceValue);
  const activity_1 = agent1.liquidityPositions + agent1.farmPositions;
  const activity_2 = agent2.liquidityPositions + agent2.farmPositions;

  // Enhanced scoring with game-specific weights
  // He3: 60% (victory condition), Path completion: 25%, Activity: 15%
  const pathScore1 = calculatePathScore(agent1.pathProgression, agent1.gameStage);
  const pathScore2 = calculatePathScore(agent2.pathProgression, agent2.gameStage);
  const score_1 = Number(he3_1) * 0.6 + pathScore1 * 0.25 + activity_1 * 0.15;
  const score_2 = Number(he3_2) * 0.6 + pathScore2 * 0.25 + activity_2 * 0.15;

  // Generate human-readable differences
  const differences: string[] = [];

  // Compare He3 balances and describe the difference
  if (he3_1 > he3_2) {
    differences.push(`${agentId1} has ${Number(he3_1 - he3_2) / 1e18} more He3`);
  } else if (he3_2 > he3_1) {
    differences.push(`${agentId2} has ${Number(he3_2 - he3_1) / 1e18} more He3`);
  }

  // Compare total resource values and describe the difference
  if (resources_1 > resources_2) {
    differences.push(
      `${agentId1} has ${Number(resources_1 - resources_2) / 1e18} more total resources`
    );
  } else if (resources_2 > resources_1) {
    differences.push(
      `${agentId2} has ${Number(resources_2 - resources_1) / 1e18} more total resources`
    );
  }

  // Compare activity levels (total positions)
  if (activity_1 > activity_2) {
    differences.push(`${agentId1} has ${activity_1 - activity_2} more positions`);
  } else if (activity_2 > activity_1) {
    differences.push(`${agentId2} has ${activity_2 - activity_1} more positions`);
  }

  // Game stage comparison
  const stageOrder = { early: 1, mid: 2, advanced: 3, endgame: 4 };
  if (stageOrder[agent1.gameStage] !== stageOrder[agent2.gameStage]) {
    const leader =
      stageOrder[agent1.gameStage] > stageOrder[agent2.gameStage] ? agentId1 : agentId2;
    differences.push(`${leader} is in a more advanced game stage`);
  }

  // Strategic analysis
  const strategicAnalysis = {
    pathCompletion: pathScore1 > pathScore2 ? agentId1 : agentId2,
    diversification:
      agent1.strategyFocus === "balanced" && agent2.strategyFocus !== "balanced"
        ? agentId1
        : agent2.strategyFocus === "balanced" && agent1.strategyFocus !== "balanced"
          ? agentId2
          : "tied",
    endgameReadiness:
      agent1.gameStage === "endgame"
        ? agentId1
        : agent2.gameStage === "endgame"
          ? agentId2
          : he3_1 > he3_2
            ? agentId1
            : agentId2,
  };

  // Return complete comparison analysis
  return {
    agent1,
    agent2,
    winner: {
      he3: he3_1 >= he3_2 ? agentId1 : agentId2, // Who has more He3
      resources: resources_1 >= resources_2 ? agentId1 : agentId2, // Who has more total resources
      activity: activity_1 >= activity_2 ? agentId1 : agentId2, // Who is more active
      strategy: pathScore1 >= pathScore2 ? agentId1 : agentId2, // Who has better strategic position
      overall: score_1 >= score_2 ? agentId1 : agentId2, // Overall winner by weighted score
    },
    differences,
    strategicAnalysis,
  };
}

/**
 * Calculate a strategic score based on path progression and game stage
 * Rewards agents who are progressing efficiently toward He3 production
 */
function calculatePathScore(
  pathProgression: AgentData["pathProgression"],
  gameStage: string
): number {
  const { carbonPath, neodymiumPath, he3Farming } = pathProgression;

  // Base score from path completion (max progression on each path)
  const maxPathProgress = Math.max(carbonPath, neodymiumPath);
  let score = maxPathProgress * 25; // 0-100 base score

  // Bonus for dual path development (balanced approach)
  if (carbonPath > 2 && neodymiumPath > 2) {
    score += 25; // Bonus for having both paths developed
  }

  // Bonus for He3 farming progression
  score += he3Farming * 30;

  // Stage-based multiplier
  const stageMultiplier = { early: 1, mid: 1.2, advanced: 1.5, endgame: 2 };
  score *= stageMultiplier[gameStage as keyof typeof stageMultiplier] || 1;

  return score;
}

/**
 * Rank all agents by overall progression/performance
 * Uses game-specific weighted scoring based on DS context
 *
 * Scoring weights adjusted for game mechanics:
 * - He3: 50% (victory condition - first to 7M He3 wins)
 * - Path Progress: 30% (strategic efficiency toward He3 production)
 * - Activity: 20% (engagement level and risk management)
 *
 * @returns Array of agents sorted by overall performance score
 */
export async function rankAgentsByProgression(): Promise<
  Array<{
    agentId: string; // Agent identifier
    he3Balance: string; // He3 balance
    totalResources: string; // Sum of all resources
    totalPositions: number; // Count of all positions
    gameStage: string; // Current game progression stage
    strategyFocus: string; // Primary strategy approach
    score: number; // Calculated performance score
    rank: number; // Position in ranking
    progressToVictory: number; // Percentage toward 7M He3 goal
  }>
> {
  // Get all available agents
  const agents = getAvailableAgents();
  const rankings = [];

  // Victory condition
  const VICTORY_THRESHOLD = 7000000000000000000000000n; // 7M He3

  // Calculate performance score for each agent
  for (const agentId of agents) {
    try {
      // Get complete agent data
      const data = await getAgentData(agentId);

      // Convert balances to readable numbers (from wei to tokens)
      const he3Score = Number(BigInt(data.he3Balance)) / 1e18;
      const pathScore = calculatePathScore(data.pathProgression, data.gameStage);
      const activityScore = data.liquidityPositions + data.farmPositions;

      // Calculate weighted performance score optimized for DS game mechanics
      // He3 (50%) + Path Progress (30%) + Activity (20%)
      const score = he3Score * 0.5 + pathScore * 0.3 + activityScore * 0.2;

      // Calculate progress to victory
      const he3BigInt = BigInt(data.he3Balance);
      const progressToVictory = Math.min(100, Number((he3BigInt * 100n) / VICTORY_THRESHOLD));

      rankings.push({
        agentId,
        he3Balance: data.he3Balance,
        totalResources: data.totalResourceValue,
        totalPositions: data.liquidityPositions + data.farmPositions,
        gameStage: data.gameStage,
        strategyFocus: data.strategyFocus,
        score,
        rank: 0, // Will be assigned after sorting
        progressToVictory,
      });
    } catch (error) {
      // Log error but continue with other agents
      console.error(`Failed to analyze ${agentId}:`, error);
    }
  }

  // Sort by performance score in descending order (highest first)
  rankings.sort((a, b) => b.score - a.score);

  // Assign rank numbers (1st place, 2nd place, etc.)
  rankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
  });

  return rankings;
}
