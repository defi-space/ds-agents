import {
  getStarknetChain,
  getTokenBalance,
  convertU256ToDecimal,
  formatTokenBalance,
  toUint256WithSpread,
} from "./starknet";
import { getAgentAddress, availableTokenSymbols, getResourceAddress } from "./contracts";
import { getFarmIndex } from "./graphql";
import contractAddresses from "../../contracts.json";

// Token weights configuration
export const TOKEN_WEIGHTS: Record<string, number> = {
  // High value tokens
  He3: 100,

  // Medium value tokens
  GPH: 50,
  Y: 50,

  // Lower value tokens
  GRP: 25,
  Dy: 25,

  // Base tokens
  wD: 5,
  C: 5,
  Nd: 5,
};

// LP Pool weights for LP token balances - matches contracts.json pairs exactly
const LP_POOL_WEIGHTS: Record<string, number> = {
  "wD/C": 20,
  "wD/GRP": 25,
  "wD/Nd": 20,
  "wD/Dy": 25,
  "GPH/Y": 40,
  "wD/He3": 50,
};

/**
 * Complete agent progression data
 */
export interface AgentProgressionData {
  agentId: string;
  resourceBalanceScore: number;
  lpPositionScore: number;
  farmingScore: number;
  totalScore: number;
  resourceBalances: Record<string, string>;
  lpBalances: Record<string, string>;
  pendingRewards: Record<string, string>;
  lastCalculatedAt: number;
}

/**
 * Agent ranking entry
 */
export interface AgentRanking {
  agentId: string;
  totalScore: number;
  resourceBalanceScore: number;
  lpPositionScore: number;
  farmingScore: number;
  rank: number;
}

/**
 * Head-to-head comparison between two agents
 */
export interface AgentComparison {
  agent1: AgentProgressionData;
  agent2: AgentProgressionData;
  winner: {
    totalScore: string;
    resourceBalance: string;
    lpPositions: string;
    farming: string;
  };
  differences: string[];
  scoreBreakdown: {
    agent1Breakdown: string;
    agent2Breakdown: string;
  };
}

/**
 * Get pending rewards from a farm using existing farm logic
 */
async function getFarmPendingRewards(agentAddress: string, farmKey: string): Promise<bigint> {
  const chain = getStarknetChain();
  const farmRouterAddress = contractAddresses.core.farmRouter;

  // Get farm index using existing logic
  let farmIndex: string;
  if (farmKey === "He3") {
    farmIndex = await getFarmIndex("He3");
  } else {
    const [tokenA, tokenB] = farmKey.split("/");
    farmIndex = await getFarmIndex(tokenA, tokenB);
  }

  // Get reward tokens using existing farm logic
  const rewardTokens = await chain.read({
    contractAddress: farmRouterAddress,
    entrypoint: "get_reward_tokens",
    calldata: [...toUint256WithSpread(farmIndex)],
  });

  // Get earned amount for the single reward token (following yield.ts pattern)
  const rewardTokenAddress = rewardTokens[1];
  if (rewardTokenAddress && rewardTokenAddress !== "0x0") {
    const earned = await chain.read({
      contractAddress: farmRouterAddress,
      entrypoint: "earned",
      calldata: [...toUint256WithSpread(farmIndex), agentAddress, rewardTokenAddress],
    });

    const earnedAmount = convertU256ToDecimal(earned[0], earned[1]);
    if (earnedAmount > 0n) {
      return earnedAmount;
    }
  }

  return 0n;
}

/**
 * Calculate resource balance score using existing token balance function
 */
async function calculateResourceBalanceScore(
  agentAddress: string
): Promise<{ score: number; balances: Record<string, string> }> {
  let totalScore = 0;
  const balances: Record<string, string> = {};

  // Get balances for all available resource tokens
  for (const symbol of availableTokenSymbols) {
    const tokenAddress = getResourceAddress(symbol);
    const balance = await getTokenBalance(tokenAddress, agentAddress);

    if (balance > 0n) {
      const normalizedBalance = Number(formatTokenBalance(balance));

      // Apply weight
      const weight = TOKEN_WEIGHTS[symbol] || 1;
      const score = normalizedBalance * weight;
      totalScore += score;

      balances[symbol] = normalizedBalance.toString();
    } else {
      balances[symbol] = "0";
    }
  }

  return { score: totalScore, balances };
}

/**
 * Calculate LP token balance score using existing token balance function
 */
async function calculateLpBalanceScore(
  agentAddress: string
): Promise<{ score: number; balances: Record<string, string> }> {
  let totalScore = 0;
  const balances: Record<string, string> = {};

  const pairs = contractAddresses.pairs as Record<string, string>;

  for (const [pairKey, pairAddress] of Object.entries(pairs)) {
    const lpBalance = await getTokenBalance(pairAddress, agentAddress);

    if (lpBalance > 0n) {
      const normalizedBalance = Number(formatTokenBalance(lpBalance));

      // Get pool weight
      const weight = LP_POOL_WEIGHTS[pairKey] || 10;
      const score = normalizedBalance * weight;
      totalScore += score;

      balances[pairKey] = normalizedBalance.toString();
    } else {
      balances[pairKey] = "0";
    }
  }

  return { score: totalScore, balances };
}

/**
 * Calculate pending rewards score using farm reward logic
 */
async function calculatePendingRewardsScore(
  agentAddress: string
): Promise<{ score: number; rewards: Record<string, string> }> {
  let totalScore = 0;
  const rewards: Record<string, string> = {};

  const farms = Object.keys(contractAddresses.farms);

  for (const farmKey of farms) {
    const rewardAmount = await getFarmPendingRewards(agentAddress, farmKey);

    if (rewardAmount > 0) {
      // Get token symbol from farm key for weight calculation
      let tokenSymbol = "wD"; // Default weight token
      if (farmKey.includes("He3")) {
        tokenSymbol = "He3";
      } else if (farmKey.includes("GPH")) {
        tokenSymbol = "GPH";
      } else if (farmKey.includes("Y")) {
        tokenSymbol = "Y";
      }
      const normalizedRewardAmount = Number(formatTokenBalance(rewardAmount));
      const weight = TOKEN_WEIGHTS[tokenSymbol] || 1;
      const score = normalizedRewardAmount * weight;
      totalScore += score;

      rewards[farmKey] = normalizedRewardAmount.toString();
    } else {
      rewards[farmKey] = "0";
    }
  }

  return { score: totalScore, rewards };
}

/**
 * Get comprehensive progression data for a specific agent
 */
export async function getAgentProgressionData(agentId: string): Promise<AgentProgressionData> {
  const agentAddress = getAgentAddress(agentId);
  const currentTime = Date.now();

  // Calculate all scores in parallel for efficiency
  const [resourceResult, lpResult, farmingResult] = await Promise.all([
    calculateResourceBalanceScore(agentAddress),
    calculateLpBalanceScore(agentAddress),
    calculatePendingRewardsScore(agentAddress),
  ]);

  const totalScore = resourceResult.score + lpResult.score + farmingResult.score;

  return {
    agentId,
    resourceBalanceScore: resourceResult.score,
    lpPositionScore: lpResult.score,
    farmingScore: farmingResult.score,
    totalScore,
    resourceBalances: resourceResult.balances,
    lpBalances: lpResult.balances,
    pendingRewards: farmingResult.rewards,
    lastCalculatedAt: currentTime,
  };
}

/**
 * Rank all agents by their total progression score
 */
export async function rankAgentsByProgression(): Promise<AgentRanking[]> {
  const agents = Object.keys(contractAddresses.agents);
  const rankings: AgentRanking[] = [];

  // Calculate scores for all agents
  for (const agentId of agents) {
    const progressionData = await getAgentProgressionData(agentId);

    rankings.push({
      agentId,
      totalScore: progressionData.totalScore,
      resourceBalanceScore: progressionData.resourceBalanceScore,
      lpPositionScore: progressionData.lpPositionScore,
      farmingScore: progressionData.farmingScore,
      rank: 0, // Will be assigned after sorting
    });
  }

  // Sort by total score in descending order
  rankings.sort((a, b) => b.totalScore - a.totalScore);

  // Assign rank numbers
  rankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
  });

  return rankings;
}

/**
 * Compare two agents head-to-head across all progression metrics
 */
export async function compareAgents(agentId1: string, agentId2: string): Promise<AgentComparison> {
  // Get complete data for both agents in parallel
  const [agent1, agent2] = await Promise.all([
    getAgentProgressionData(agentId1),
    getAgentProgressionData(agentId2),
  ]);

  // Determine winners in each category
  const winner = {
    totalScore: agent1.totalScore >= agent2.totalScore ? agentId1 : agentId2,
    resourceBalance:
      agent1.resourceBalanceScore >= agent2.resourceBalanceScore ? agentId1 : agentId2,
    lpPositions: agent1.lpPositionScore >= agent2.lpPositionScore ? agentId1 : agentId2,
    farming: agent1.farmingScore >= agent2.farmingScore ? agentId1 : agentId2,
  };

  // Generate human-readable differences
  const differences: string[] = [];

  const scoreDiff = Math.abs(agent1.totalScore - agent2.totalScore);
  if (scoreDiff > 0) {
    const leader = agent1.totalScore > agent2.totalScore ? agentId1 : agentId2;
    differences.push(`${leader} leads by ${scoreDiff.toFixed(2)} total score points`);
  }

  const resourceDiff = Math.abs(agent1.resourceBalanceScore - agent2.resourceBalanceScore);
  if (resourceDiff > 0) {
    const leader = agent1.resourceBalanceScore > agent2.resourceBalanceScore ? agentId1 : agentId2;
    differences.push(`${leader} has ${resourceDiff.toFixed(2)} more resource balance score`);
  }

  const lpDiff = Math.abs(agent1.lpPositionScore - agent2.lpPositionScore);
  if (lpDiff > 0) {
    const leader = agent1.lpPositionScore > agent2.lpPositionScore ? agentId1 : agentId2;
    differences.push(`${leader} has ${lpDiff.toFixed(2)} more LP position score`);
  }

  const farmDiff = Math.abs(agent1.farmingScore - agent2.farmingScore);
  if (farmDiff > 0) {
    const leader = agent1.farmingScore > agent2.farmingScore ? agentId1 : agentId2;
    differences.push(`${leader} has ${farmDiff.toFixed(2)} more farming score`);
  }

  // Create score breakdown strings
  const scoreBreakdown = {
    agent1Breakdown: `Resource: ${agent1.resourceBalanceScore.toFixed(2)}, LP: ${agent1.lpPositionScore.toFixed(2)}, Farming: ${agent1.farmingScore.toFixed(2)}, Total: ${agent1.totalScore.toFixed(2)}`,
    agent2Breakdown: `Resource: ${agent2.resourceBalanceScore.toFixed(2)}, LP: ${agent2.lpPositionScore.toFixed(2)}, Farming: ${agent2.farmingScore.toFixed(2)}, Total: ${agent2.totalScore.toFixed(2)}`,
  };

  return {
    agent1,
    agent2,
    winner,
    differences,
    scoreBreakdown,
  };
}
