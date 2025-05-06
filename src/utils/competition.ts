import { getCategoryAddresses, isAddressOfType } from "./contracts";
import { executeQuery, getGameSessionId } from "./graphql";
import { getCurrentAgentId, getTokenBalance, normalizeAddress } from "./starknet";
import { GET_AGENT_LIQUIDITY_POSITIONS, GET_AGENT_STAKE_POSITIONS } from "./queries";

// Define types for competitive intelligence
export interface LiquidityPosition {
  id: string;
  pairAddress: string;
  agentAddress: string;
  liquidity: string;
  depositsToken0: string;
  depositsToken1: string;
  withdrawalsToken0: string;
  withdrawalsToken1: string;
  pair?: {
    token0Address: string;
    token1Address: string;
    reserve0: string;
    reserve1: string;
    totalSupply: string;
  };
}

export interface StakePosition {
  id: string;
  farmAddress: string;
  agentAddress: string;
  stakedAmount: string;
  rewards: string;
  penaltyEndTime: string;
  rewardPerTokenPaid: string;
  farm?: {
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
  agentStake: StakePosition[];
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
    // Check if the value is an object and not a string
    if (typeof value === 'object') {
      console.error(`Error: Expected string but received object:`, value);
      return defaultValue;
    }
    
    // Convert the value to a string if it's not already
    const stringValue = String(value).trim();
    
    // Check if the string is empty after trimming
    if (!stringValue) return defaultValue;
    
    // Remove any non-numeric characters (except minus sign at the beginning)
    const cleanedValue = stringValue.replace(/^(-?)(.*)$/, (_, sign, nums) => 
      sign + nums.replace(/[^\d]/g, ''));
      
    // If nothing remains after cleaning, return default
    if (cleanedValue === '' || cleanedValue === '-') return defaultValue;
    
    return BigInt(cleanedValue);
  } catch (error) {
    console.error(`Error converting ${value} to BigInt:`, error);
    return defaultValue;
  }
}

/**
 * Analyzes an agent's resource balances to determine their resource focus
 * @param resourceBalances Record of resource balances
 * @returns An object with resource metrics for creative interpretation
 */
export function analyzeResourceFocus(resourceBalances: Record<string, string>): any {
  try {
    // Convert balances to BigInt for comparison
    const balances: Record<string, bigint> = {};
    for (const [resource, balance] of Object.entries(resourceBalances)) {
      if (balance !== "Error") {
        balances[resource] = safeBigIntConversion(balance);
      }
    }
    
    if (Object.keys(balances).length === 0) return { error: "No valid resource data" };
    
    // Calculate total balance and resource percentages
    const totalBalance = Object.values(balances).reduce((acc, val) => acc + val, 0n);
    if (totalBalance === 0n) return { error: "Zero total balance" };
    
    // Calculate percentages and ratios for all resources
    const resourceMetrics: Record<string, any> = {};
    const resourcePaths = {
      graphenePath: ["carbon", "graphite", "graphene"],
      yttriumPath: ["neodymium", "dysprosium", "yttrium"],
      helium3: ["helium3"]
    };
    
    // Calculate individual resource metrics
    for (const [resource, balance] of Object.entries(balances)) {
      const percentage = Number((balance * 10000n) / totalBalance) / 100; // To 2 decimal places
      
      resourceMetrics[resource] = {
        balance: balance.toString(),
        percentage,
        isZero: balance === 0n
      };
    }
    
    // Calculate path totals
    const pathTotals: Record<string, { balance: bigint, percentage: number }> = {};
    
    for (const [pathName, resources] of Object.entries(resourcePaths)) {
      const pathBalance = resources.reduce((acc, resource) => {
        return acc + (balances[resource] || 0n);
      }, 0n);
      
      const pathPercentage = Number((pathBalance * 10000n) / totalBalance) / 100;
      
      pathTotals[pathName] = {
        balance: pathBalance,
        percentage: pathPercentage
      };
    }
    
    // Find dominant resources (top 3)
    const sortedResources = Object.entries(resourceMetrics)
      .sort(([, a], [, b]) => b.percentage - a.percentage)
      .slice(0, 3)
      .map(([resource, metrics]) => ({
        name: resource,
        ...metrics
      }));
    
    // Calculate ratios between key resource pairs
    const ratios: Record<string, number> = {};
    
    // Carbon to Graphite ratio (processing efficiency)
    if (balances["carbon"] > 0n && balances["graphite"] > 0n) {
      ratios["carbonToGraphite"] = Number(balances["graphite"] * 100n / balances["carbon"]) / 100;
    }
    
    // Graphite to Graphene ratio (advanced processing)
    if (balances["graphite"] > 0n && balances["graphene"] > 0n) {
      ratios["graphiteToGraphene"] = Number(balances["graphene"] * 100n / balances["graphite"]) / 100;
    }
    
    // Neodymium to Dysprosium ratio
    if (balances["neodymium"] > 0n && balances["dysprosium"] > 0n) {
      ratios["neodymiumToDysprosium"] = Number(balances["dysprosium"] * 100n / balances["neodymium"]) / 100;
    }
    
    // Dysprosium to Yttrium ratio
    if (balances["dysprosium"] > 0n && balances["yttrium"] > 0n) {
      ratios["dysprosiumToYttrium"] = Number(balances["yttrium"] * 100n / balances["dysprosium"]) / 100;
    }
    
    // Advanced resources to He3 production potential
    if ((balances["graphene"] > 0n || balances["yttrium"] > 0n) && balances["helium3"] > 0n) {
      const advancedSum = balances["graphene"] + balances["yttrium"];
      ratios["advancedToHe3"] = Number(balances["helium3"] * 100n / advancedSum) / 100;
    }
    
    return {
      resources: resourceMetrics,
      dominantResources: sortedResources,
      pathTotals,
      ratios,
      totalResourceValue: totalBalance.toString()
    };
  } catch (error) {
    console.error("Error analyzing resource focus:", error);
    return { error: "Analysis error", message: (error as Error).message };
  }
}

/**
 * Analyzes an agent's path preference based on their resources and positions
 * @param resourceBalances Record of resource balances
 * @param liquidityPositions Liquidity positions data
 * @param stakePositions Staking positions data
 * @returns An object with path metrics for creative interpretation
 */
export function analyzePathPreference(
  resourceBalances: Record<string, string>,
  liquidityPositions: any,
  stakePositions: any
): any {
  try {
    // Define resources in each path
    const pathResources = {
      graphene: ["carbon", "graphite", "graphene"],
      yttrium: ["neodymium", "dysprosium", "yttrium"]
    };
    
    // Calculate metrics for resource distribution, liquidity positions, and stakes
    const metrics = {
      resources: {
        graphene: { 
          raw: 0n, 
          percentage: 0,
          byStage: {
            base: 0n,      // Carbon
            intermediate: 0n, // Graphite
            advanced: 0n    // Graphene
          }
        },
        yttrium: { 
          raw: 0n, 
          percentage: 0,
          byStage: {
            base: 0n,      // Neodymium
            intermediate: 0n, // Dysprosium
            advanced: 0n    // Yttrium
          }
        }
      },
      liquidity: {
        graphene: { count: 0, value: 0n, percentage: 0 },
        yttrium: { count: 0, value: 0n, percentage: 0 },
        mixed: { count: 0, value: 0n, percentage: 0 }
      },
      staking: {
        graphene: { count: 0, value: 0n, percentage: 0 },
        yttrium: { count: 0, value: 0n, percentage: 0 }
      },
      overall: {
        graphene: {
          score: 0,
          byActivityType: {
            resources: 0,
            liquidity: 0,
            staking: 0
          }
        },
        yttrium: {
          score: 0,
          byActivityType: {
            resources: 0,
            liquidity: 0,
            staking: 0
          }
        },
        pathDominance: 0, // -100 to 100, negative = yttrium dominance, positive = graphene dominance
        diversification: 0, // 0 to 100, higher = more balanced between paths
        activityLevel: 0   // 0 to 100, higher = more active across all metrics
      }
    };
    
    // Analyze resource distribution
    let totalResourceValue = 0n;
    
    for (const [resource, balance] of Object.entries(resourceBalances)) {
      if (balance === "Error") continue;
      
      const balanceValue = safeBigIntConversion(balance);
      if (balanceValue === 0n) continue;
      
      totalResourceValue += balanceValue;
      
      // Add to path totals
      if (pathResources.graphene.includes(resource)) {
        metrics.resources.graphene.raw += balanceValue;
        
        // Categorize by resource stage
        if (resource === "carbon") {
          metrics.resources.graphene.byStage.base += balanceValue;
        } else if (resource === "graphite") {
          metrics.resources.graphene.byStage.intermediate += balanceValue;
        } else if (resource === "graphene") {
          metrics.resources.graphene.byStage.advanced += balanceValue;
        }
      }
      
      if (pathResources.yttrium.includes(resource)) {
        metrics.resources.yttrium.raw += balanceValue;
        
        // Categorize by resource stage
        if (resource === "neodymium") {
          metrics.resources.yttrium.byStage.base += balanceValue;
        } else if (resource === "dysprosium") {
          metrics.resources.yttrium.byStage.intermediate += balanceValue;
        } else if (resource === "yttrium") {
          metrics.resources.yttrium.byStage.advanced += balanceValue;
        }
      }
    }
    
    // Calculate resource percentages
    if (totalResourceValue > 0n) {
      metrics.resources.graphene.percentage = Number((metrics.resources.graphene.raw * 10000n) / totalResourceValue) / 100;
      metrics.resources.yttrium.percentage = Number((metrics.resources.yttrium.raw * 10000n) / totalResourceValue) / 100;
    }
    
    // Analyze liquidity positions
    const positions = liquidityPositions?.liquidityPosition || [];
    let totalLiquidityValue = 0n;
    
    for (const position of positions) {
      const pairAddress = position.pairAddress;
      const liquidityValue = safeBigIntConversion(position.liquidity);
      
      totalLiquidityValue += liquidityValue;
      
      let graphenePath = false;
      let yttriumPath = false;
      
      // Check if this pair involves graphene path tokens
      if (
        isAddressOfType(pairAddress, 'lpPairs', 'carbon') ||
        isAddressOfType(pairAddress, 'lpPairs', 'graphite') ||
        isAddressOfType(pairAddress, 'lpPairs', 'graphene')
      ) {
        graphenePath = true;
        metrics.liquidity.graphene.count++;
        metrics.liquidity.graphene.value += liquidityValue;
      }
      
      // Check if this pair involves yttrium path tokens
      if (
        isAddressOfType(pairAddress, 'lpPairs', 'neodymium') ||
        isAddressOfType(pairAddress, 'lpPairs', 'dysprosium') ||
        isAddressOfType(pairAddress, 'lpPairs', 'yttrium')
      ) {
        yttriumPath = true;
        metrics.liquidity.yttrium.count++;
        metrics.liquidity.yttrium.value += liquidityValue;
      }
      
      // If both paths are involved (e.g., GHN-Y pair), count as mixed
      if (graphenePath && yttriumPath) {
        metrics.liquidity.mixed.count++;
        metrics.liquidity.mixed.value += liquidityValue;
      }
    }
    
    // Calculate liquidity percentages
    if (positions.length > 0) {
      const totalPositions = positions.length;
      if (totalPositions > 0) {
        metrics.liquidity.graphene.percentage = (metrics.liquidity.graphene.count * 100) / totalPositions;
        metrics.liquidity.yttrium.percentage = (metrics.liquidity.yttrium.count * 100) / totalPositions;
        metrics.liquidity.mixed.percentage = (metrics.liquidity.mixed.count * 100) / totalPositions;
      }
    }
    
    // Analyze stake positions
    const stakes = stakePositions?.agentStake || [];
    let totalStakingValue = 0n;
    
    for (const stake of stakes) {
      const farmAddress = stake.farmAddress;
      const stakedAmount = safeBigIntConversion(stake.stakedAmount);
      
      totalStakingValue += stakedAmount;
      
      // Check if this farm is for graphene path tokens
      if (
        isAddressOfType(farmAddress, 'farms', 'grp') ||
        isAddressOfType(farmAddress, 'farms', 'gph')
      ) {
        metrics.staking.graphene.count++;
        metrics.staking.graphene.value += stakedAmount;
      }
      
      // Check if this farm is for yttrium path tokens
      if (
        isAddressOfType(farmAddress, 'farms', 'dy') ||
        isAddressOfType(farmAddress, 'farms', 'y')
      ) {
        metrics.staking.yttrium.count++;
        metrics.staking.yttrium.value += stakedAmount;
      }
    }
    
    // Calculate staking percentages
    if (stakes.length > 0) {
      const totalStakes = stakes.length;
      if (totalStakes > 0) {
        metrics.staking.graphene.percentage = (metrics.staking.graphene.count * 100) / totalStakes;
        metrics.staking.yttrium.percentage = (metrics.staking.yttrium.count * 100) / totalStakes;
      }
    }
    
    // Calculate overall path scores with weighted importance
    // Resources: 30%, Liquidity: 35%, Staking: 35%
    metrics.overall.graphene.byActivityType.resources = metrics.resources.graphene.percentage;
    metrics.overall.graphene.byActivityType.liquidity = metrics.liquidity.graphene.percentage;
    metrics.overall.graphene.byActivityType.staking = metrics.staking.graphene.percentage;
    
    metrics.overall.yttrium.byActivityType.resources = metrics.resources.yttrium.percentage;
    metrics.overall.yttrium.byActivityType.liquidity = metrics.liquidity.yttrium.percentage;
    metrics.overall.yttrium.byActivityType.staking = metrics.staking.yttrium.percentage;
    
    // Calculate overall scores
    metrics.overall.graphene.score = 
      (metrics.resources.graphene.percentage * 0.3) + 
      (metrics.liquidity.graphene.percentage * 0.35) + 
      (metrics.staking.graphene.percentage * 0.35);
    
    metrics.overall.yttrium.score = 
      (metrics.resources.yttrium.percentage * 0.3) + 
      (metrics.liquidity.yttrium.percentage * 0.35) + 
      (metrics.staking.yttrium.percentage * 0.35);
    
    // Calculate path dominance (-100 to 100, negative = yttrium, positive = graphene)
    const scoreDifference = metrics.overall.graphene.score - metrics.overall.yttrium.score;
    const maxDifference = 100; // Maximum theoretical difference
    metrics.overall.pathDominance = Math.round((scoreDifference / maxDifference) * 100);
    
    // Calculate diversification (0 to 100, higher = more balanced)
    const balanceScore = 100 - Math.abs(metrics.overall.pathDominance);
    metrics.overall.diversification = balanceScore;
    
    // Calculate activity level (0 to 100)
    const sumOfAllActivities = 
      metrics.overall.graphene.score + 
      metrics.overall.yttrium.score;
    
    metrics.overall.activityLevel = Math.min(100, Math.round(sumOfAllActivities / 2));
    
    return metrics;
  } catch (error) {
    console.error("Error analyzing path preference:", error);
    return { error: "Analysis error", message: (error as Error).message };
  }
}

/**
 * Analyzes an agent's liquidity strategy based on their positions
 * @param liquidityPositions Liquidity positions data
 * @returns An object with liquidity metrics for creative interpretation
 */
export function analyzeLiquidityStrategy(liquidityPositions: any): any {
  try {
    const positions = liquidityPositions?.liquidityPosition || [];
    
    if (positions.length === 0) {
      return { hasPositions: false };
    }
    
    // Define resource categories for analysis
    const resourceCategories = {
      base: ["carbon", "neodymium"],
      intermediate: ["graphite", "dysprosium"],
      advanced: ["graphene", "yttrium"],
      he3: ["helium3"]
    };
    
    // Initialize metrics structure
    const metrics = {
      hasPositions: true,
      totalPositions: positions.length,
      totalLiquidity: 0n,
      byResourceType: {
        base: { count: 0, liquidity: 0n, percentage: 0 },
        intermediate: { count: 0, liquidity: 0n, percentage: 0 },
        advanced: { count: 0, liquidity: 0n, percentage: 0 },
        he3: { count: 0, liquidity: 0n, percentage: 0 },
        other: { count: 0, liquidity: 0n, percentage: 0 }
      },
      byResourceName: {} as Record<string, { count: number, liquidity: bigint, percentage: number }>,
      positionSummary: [] as Array<{ 
        id: string, 
        pairAddress: string,
        resourceType: string,
        liquidity: string,
        resourceNames: string[] 
      }>,
      strategyIndicators: {
        resourceDiversification: 0,  // 0-100, higher means more diversified
        advancedResourceFocus: 0,    // 0-100, higher means more focus on advanced
        pathFocus: 0,                // -100 to 100, positive = graphene, negative = yttrium
        he3Emphasis: 0               // 0-100, higher means more focus on He3
      }
    };
    
    // Initialize resource-specific metrics
    for (const category of Object.values(resourceCategories).flat()) {
      metrics.byResourceName[category] = { count: 0, liquidity: 0n, percentage: 0 };
    }
    
    // Analyze positions
    for (const position of positions) {
      const pairAddress = position.pairAddress;
      const liquidity = safeBigIntConversion(position.liquidity);
      
      metrics.totalLiquidity += liquidity;
      
      // Determine resources involved in this position
      const resourcesInvolved: string[] = [];
      let resourceType = "other";
      
      // Check for base resources
      for (const resource of resourceCategories.base) {
        if (isAddressOfType(pairAddress, 'lpPairs', resource)) {
          resourcesInvolved.push(resource);
          metrics.byResourceName[resource].count++;
          metrics.byResourceName[resource].liquidity += liquidity;
          metrics.byResourceType.base.count++;
          metrics.byResourceType.base.liquidity += liquidity;
          resourceType = "base";
        }
      }
      
      // Check for intermediate resources
      for (const resource of resourceCategories.intermediate) {
        if (isAddressOfType(pairAddress, 'lpPairs', resource)) {
          resourcesInvolved.push(resource);
          metrics.byResourceName[resource].count++;
          metrics.byResourceName[resource].liquidity += liquidity;
          metrics.byResourceType.intermediate.count++;
          metrics.byResourceType.intermediate.liquidity += liquidity;
          resourceType = "intermediate";
        }
      }
      
      // Check for advanced resources
      for (const resource of resourceCategories.advanced) {
        if (isAddressOfType(pairAddress, 'lpPairs', resource)) {
          resourcesInvolved.push(resource);
          metrics.byResourceName[resource].count++;
          metrics.byResourceName[resource].liquidity += liquidity;
          metrics.byResourceType.advanced.count++;
          metrics.byResourceType.advanced.liquidity += liquidity;
          resourceType = "advanced";
        }
      }
      
      // Check for He3
      if (isAddressOfType(pairAddress, 'lpPairs', 'helium3')) {
        resourcesInvolved.push("helium3");
        metrics.byResourceName["helium3"].count++;
        metrics.byResourceName["helium3"].liquidity += liquidity;
        metrics.byResourceType.he3.count++;
        metrics.byResourceType.he3.liquidity += liquidity;
        resourceType = "he3";
      }
      
      // If no specific resources identified, count as other
      if (resourcesInvolved.length === 0) {
        metrics.byResourceType.other.count++;
        metrics.byResourceType.other.liquidity += liquidity;
        resourceType = "other";
      }
      
      // Add to position summary
      metrics.positionSummary.push({
        id: position.id,
        pairAddress: position.pairAddress,
        resourceType,
        liquidity: liquidity.toString(),
        resourceNames: resourcesInvolved
      });
    }
    
    // Calculate percentages
    if (metrics.totalLiquidity > 0n) {
      // Calculate percentage by resource type
      for (const [type, data] of Object.entries(metrics.byResourceType)) {
        metrics.byResourceType[type as keyof typeof metrics.byResourceType].percentage = 
          Number((data.liquidity * 10000n) / metrics.totalLiquidity) / 100;
      }
      
      // Calculate percentage by resource name
      for (const [resource, data] of Object.entries(metrics.byResourceName)) {
        metrics.byResourceName[resource].percentage = 
          Number((data.liquidity * 10000n) / metrics.totalLiquidity) / 100;
      }
    }
    
    // Calculate strategy indicators
    
    // Resource diversification (higher = more diversified)
    const resourceTypeCount = Object.values(metrics.byResourceType)
      .filter(type => type.count > 0)
      .length;
      
    const resourceNameCount = Object.values(metrics.byResourceName)
      .filter(resource => resource.count > 0)
      .length;
    
    metrics.strategyIndicators.resourceDiversification = 
      Math.min(100, ((resourceTypeCount / 4) * 50) + ((resourceNameCount / 7) * 50));
    
    // Advanced resource focus
    metrics.strategyIndicators.advancedResourceFocus = 
      metrics.byResourceType.advanced.percentage + 
      (metrics.byResourceType.he3.percentage * 0.5);
    
    // Path focus (-100 to 100, positive = graphene, negative = yttrium)
    const grapheneLiquidity = 
      (metrics.byResourceName["carbon"]?.liquidity || 0n) + 
      (metrics.byResourceName["graphite"]?.liquidity || 0n) + 
      (metrics.byResourceName["graphene"]?.liquidity || 0n);
      
    const yttriumLiquidity = 
      (metrics.byResourceName["neodymium"]?.liquidity || 0n) + 
      (metrics.byResourceName["dysprosium"]?.liquidity || 0n) + 
      (metrics.byResourceName["yttrium"]?.liquidity || 0n);
    
    if (grapheneLiquidity > 0n || yttriumLiquidity > 0n) {
      const totalPathLiquidity = grapheneLiquidity + yttriumLiquidity;
      if (totalPathLiquidity > 0n) {
        const graphenePercentage = Number((grapheneLiquidity * 100n) / totalPathLiquidity);
        metrics.strategyIndicators.pathFocus = Math.round((graphenePercentage - 50) * 2);
      }
    }
    
    // He3 emphasis
    metrics.strategyIndicators.he3Emphasis = metrics.byResourceType.he3.percentage;
    
    return metrics;
  } catch (error) {
    console.error("Error analyzing liquidity strategy:", error);
    return { error: "Analysis error", message: (error as Error).message };
  }
}

/**
 * Analyzes an agent's staking strategy based on their positions
 * @param stakePositions Staking positions data
 * @returns An object with staking metrics for creative interpretation
 */
export function analyzeStakingStrategy(stakePositions: any): any {
  try {
    const stakes = stakePositions?.agentStake || [];
    
    if (stakes.length === 0) {
      return { hasPositions: false };
    }
    
    // Define farm categories for analysis
    const farmCategories = {
      baseResource: ["grp", "dy"],           // Carbon-Graphite LP and Neodymium-Dysprosium LP
      intermediateResource: ["gph", "y"],     // Graphite-Graphene LP and Dysprosium-Yttrium LP
      he3Production: ["he3"],                // Farms that produce He3 (not direct He3 staking)
      he3Staking: ["he3Stake"]               // Direct He3 staking
    };
    
    // Initialize metrics structure
    const metrics = {
      hasPositions: true,
      totalPositions: stakes.length,
      totalStaked: 0n,
      byFarmType: {
        baseResource: { count: 0, stakedAmount: 0n, percentage: 0, rewards: 0n },
        intermediateResource: { count: 0, stakedAmount: 0n, percentage: 0, rewards: 0n },
        he3Production: { count: 0, stakedAmount: 0n, percentage: 0, rewards: 0n },
        he3Staking: { count: 0, stakedAmount: 0n, percentage: 0, rewards: 0n },
        other: { count: 0, stakedAmount: 0n, percentage: 0, rewards: 0n }
      },
      byFarmId: {} as Record<string, { count: number, stakedAmount: bigint, rewards: bigint, percentage: number }>,
      byPath: {
        graphene: { count: 0, stakedAmount: 0n, percentage: 0 },
        yttrium: { count: 0, stakedAmount: 0n, percentage: 0 }
      },
      positionSummary: [] as Array<{
        id: string,
        farmAddress: string,
        farmType: string,
        path: string,
        stakedAmount: string,
        rewards: string,
        penaltyEndTime: string,
        farm?: any
      }>,
      strategyIndicators: {
        he3DirectStakingFocus: 0,    // 0-100, higher means more focus on He3 direct staking
        productionChainStage: 0,     // 0-100, 0 = base, 100 = advanced
        pathFocus: 0,                // -100 to 100, positive = graphene, negative = yttrium
        yieldFarmingIntensity: 0,    // 0-100, based on position count and stake amounts
        he3GenerationPotential: 0    // 0-100, higher means more potential He3 generation
      }
    };
    
    // Analyze all stake positions
    for (const stake of stakes) {
      const farmAddress = stake.farmAddress;
      const stakedAmount = safeBigIntConversion(stake.stakedAmount);
      const rewards = safeBigIntConversion(stake.rewards);
      
      metrics.totalStaked += stakedAmount;
      
      let farmType = "other";
      let path = "none";
      
      // Check farm type
      if (isAddressOfType(farmAddress, 'farms', 'he3Stake')) {
        farmType = "he3Staking";
        metrics.byFarmType.he3Staking.count++;
        metrics.byFarmType.he3Staking.stakedAmount += stakedAmount;
        metrics.byFarmType.he3Staking.rewards += rewards;
      } 
      else if (isAddressOfType(farmAddress, 'farms', 'he3') && 
          !isAddressOfType(farmAddress, 'farms', 'he3Stake')) {
        farmType = "he3Production";
        metrics.byFarmType.he3Production.count++;
        metrics.byFarmType.he3Production.stakedAmount += stakedAmount;
        metrics.byFarmType.he3Production.rewards += rewards;
      }
      else {
        // Check base resource farms
        for (const farm of farmCategories.baseResource) {
          if (isAddressOfType(farmAddress, 'farms', farm)) {
            farmType = "baseResource";
            metrics.byFarmType.baseResource.count++;
            metrics.byFarmType.baseResource.stakedAmount += stakedAmount;
            metrics.byFarmType.baseResource.rewards += rewards;
            
            // Determine path
            if (farm === "grp") {
              path = "graphene";
              metrics.byPath.graphene.count++;
              metrics.byPath.graphene.stakedAmount += stakedAmount;
            } else if (farm === "dy") {
              path = "yttrium";
              metrics.byPath.yttrium.count++;
              metrics.byPath.yttrium.stakedAmount += stakedAmount;
            }
            
            // Record at the individual farm level
            if (!metrics.byFarmId[farm]) {
              metrics.byFarmId[farm] = { count: 0, stakedAmount: 0n, rewards: 0n, percentage: 0 };
            }
            metrics.byFarmId[farm].count++;
            metrics.byFarmId[farm].stakedAmount += stakedAmount;
            metrics.byFarmId[farm].rewards += rewards;
          }
        }
        
        // Check intermediate resource farms
        for (const farm of farmCategories.intermediateResource) {
          if (isAddressOfType(farmAddress, 'farms', farm)) {
            farmType = "intermediateResource";
            metrics.byFarmType.intermediateResource.count++;
            metrics.byFarmType.intermediateResource.stakedAmount += stakedAmount;
            metrics.byFarmType.intermediateResource.rewards += rewards;
            
            // Determine path
            if (farm === "gph") {
              path = "graphene";
              metrics.byPath.graphene.count++;
              metrics.byPath.graphene.stakedAmount += stakedAmount;
            } else if (farm === "y") {
              path = "yttrium";
              metrics.byPath.yttrium.count++;
              metrics.byPath.yttrium.stakedAmount += stakedAmount;
            }
            
            // Record at the individual farm level
            if (!metrics.byFarmId[farm]) {
              metrics.byFarmId[farm] = { count: 0, stakedAmount: 0n, rewards: 0n, percentage: 0 };
            }
            metrics.byFarmId[farm].count++;
            metrics.byFarmId[farm].stakedAmount += stakedAmount;
            metrics.byFarmId[farm].rewards += rewards;
          }
        }
        
        // If no specific farm identified, count as other
        if (farmType === "other") {
          metrics.byFarmType.other.count++;
          metrics.byFarmType.other.stakedAmount += stakedAmount;
          metrics.byFarmType.other.rewards += rewards;
        }
      }
      
      // Add to position summary
      metrics.positionSummary.push({
        id: stake.id,
        farmAddress: stake.farmAddress,
        farmType,
        path,
        stakedAmount: stakedAmount.toString(),
        rewards: rewards.toString(),
        penaltyEndTime: stake.penaltyEndTime,
        farm: stake.farm
      });
    }
    
    // Calculate percentages if there are any stakes
    if (metrics.totalStaked > 0n) {
      // Calculate percentage by farm type
      for (const [type, data] of Object.entries(metrics.byFarmType)) {
        metrics.byFarmType[type as keyof typeof metrics.byFarmType].percentage = 
          Number((data.stakedAmount * 10000n) / metrics.totalStaked) / 100;
      }
      
      // Calculate percentage by individual farm
      for (const [farm, data] of Object.entries(metrics.byFarmId)) {
        metrics.byFarmId[farm].percentage = 
          Number((data.stakedAmount * 10000n) / metrics.totalStaked) / 100;
      }
      
      // Calculate percentage by path
      const totalPathStaked = metrics.byPath.graphene.stakedAmount + metrics.byPath.yttrium.stakedAmount;
      if (totalPathStaked > 0n) {
        metrics.byPath.graphene.percentage = 
          Number((metrics.byPath.graphene.stakedAmount * 10000n) / totalPathStaked) / 100;
        metrics.byPath.yttrium.percentage = 
          Number((metrics.byPath.yttrium.stakedAmount * 10000n) / totalPathStaked) / 100;
      }
    }
    
    // Calculate strategy indicators
    
    // He3 direct staking focus
    metrics.strategyIndicators.he3DirectStakingFocus = metrics.byFarmType.he3Staking.percentage;
    
    // Production chain stage (0 = base, 100 = advanced)
    const baseWeight = metrics.byFarmType.baseResource.percentage * 0;
    const intermediateWeight = metrics.byFarmType.intermediateResource.percentage * 50;
    const advancedWeight = 
      (metrics.byFarmType.he3Production.percentage + metrics.byFarmType.he3Staking.percentage) * 100;
    
    const totalWeight = 
      metrics.byFarmType.baseResource.percentage + 
      metrics.byFarmType.intermediateResource.percentage + 
      metrics.byFarmType.he3Production.percentage + 
      metrics.byFarmType.he3Staking.percentage;
    
    if (totalWeight > 0) {
      metrics.strategyIndicators.productionChainStage = 
        (baseWeight + intermediateWeight + advancedWeight) / totalWeight;
    }
    
    // Path focus (-100 to 100, positive = graphene, negative = yttrium)
    if (metrics.byPath.graphene.stakedAmount > 0n || metrics.byPath.yttrium.stakedAmount > 0n) {
      metrics.strategyIndicators.pathFocus = 
        metrics.byPath.graphene.percentage > 0 || metrics.byPath.yttrium.percentage > 0
          ? Math.round((metrics.byPath.graphene.percentage - metrics.byPath.yttrium.percentage) * 2)
          : 0;
    }
    
    // Yield farming intensity (0-100)
    // Based on position count and distribution across farm types
    const positionFactor = Math.min(1, metrics.totalPositions / 10) * 50;
    
    const distributionFactor = Object.values(metrics.byFarmType)
      .filter(type => type.count > 0)
      .length * 12.5; // Max 50 if all 4 types are used
    
    metrics.strategyIndicators.yieldFarmingIntensity = Math.min(100, positionFactor + distributionFactor);
    
    // He3 generation potential (0-100)
    // Higher weights for intermediate and he3 production farms
    const he3PotentialScore = 
      (metrics.byFarmType.baseResource.percentage * 0.2) +
      (metrics.byFarmType.intermediateResource.percentage * 0.5) +
      (metrics.byFarmType.he3Production.percentage * 1.0) +
      (metrics.byFarmType.he3Staking.percentage * 0.3);
    
    metrics.strategyIndicators.he3GenerationPotential = Math.min(100, he3PotentialScore);
    
    return metrics;
  } catch (error) {
    console.error("Error analyzing staking strategy:", error);
    return { error: "Analysis error", message: (error as Error).message };
  }
}

/**
 * Determines an agent's overall strategy metrics based on their resources and positions
 * @param resourceBalances Record of resource balances
 * @param liquidityPositions Liquidity positions data
 * @param stakePositions Staking positions data
 * @param he3Balance He3 token balance
 * @returns An object with comprehensive strategy metrics for creative interpretation
 */
export function determineOverallStrategy(
  resourceBalances: Record<string, string>,
  liquidityPositions: any,
  stakePositions: any,
  he3Balance: string
): any {
  try {
    // Convert He3 balance to BigInt safely
    const he3BalanceValue = safeBigIntConversion(he3Balance);
    
    // Get detailed analytics from other functions
    const resourceAnalysis = analyzeResourceFocus(resourceBalances);
    const pathAnalysis = analyzePathPreference(resourceBalances, liquidityPositions, stakePositions);
    const liquidityAnalysis = analyzeLiquidityStrategy(liquidityPositions);
    const stakingAnalysis = analyzeStakingStrategy(stakePositions);
    
    // Determine game stage and metrics
    const metrics = {
      gamePhaseIndicators: {
        he3Balance: he3BalanceValue.toString(),
        he3Percentage: 0, // Percentage of total resources
        hasAdvancedResources: false,
        hasIntermediateResources: false,
        hasBaseResources: false,
        hasLiquidityPositions: liquidityAnalysis?.hasPositions === true,
        hasStakingPositions: stakingAnalysis?.hasPositions === true,
        productionCapabilities: {
          graphene: false,
          yttrium: false,
          he3: false
        }
      },
      compositeMetrics: {
        gameStage: 0, // 0-100, higher = later stage
        resourceOptimization: 0, // 0-100, higher = more optimized
        verticalIntegration: 0, // 0-100, higher = more integrated resource chains
        liquidityEfficiency: 0, // 0-100, higher = more efficient liquidity deployment
        yieldGeneration: 0, // 0-100, higher = better yield strategy
        pathSpecialization: 0, // -100 to 100, positive = graphene focused, negative = yttrium focused
        he3Focus: 0, // 0-100, higher = more focused on He3
        strategicDiversity: 0 // 0-100, higher = more diversified strategy
      },
      strategyComponents: {
        resourceFocus: resourceAnalysis,
        pathPreference: pathAnalysis,
        liquidityStrategy: liquidityAnalysis,
        stakingStrategy: stakingAnalysis
      },
      activityDistribution: {
        resource: {
          graphenePath: 0,
          yttriumPath: 0,
          he3Direct: 0
        },
        liquidity: {
          graphenePath: 0,
          yttriumPath: 0,
          he3Pairs: 0
        },
        staking: {
          graphenePath: 0,
          yttriumPath: 0,
          he3Production: 0,
          he3Direct: 0
        }
      }
    };
    
    // Check for resources at different stages of production
    if (resourceBalances) {
      // Check for intermediate resources
      const hasGraphite = resourceBalances["graphite"] !== undefined && 
        safeBigIntConversion(resourceBalances["graphite"]) > 0n;
      const hasDysprosium = resourceBalances["dysprosium"] !== undefined && 
        safeBigIntConversion(resourceBalances["dysprosium"]) > 0n;
      metrics.gamePhaseIndicators.hasIntermediateResources = hasGraphite || hasDysprosium;
        
      // Check for advanced resources
      const hasGraphene = resourceBalances["graphene"] !== undefined && 
        safeBigIntConversion(resourceBalances["graphene"]) > 0n;
      const hasYttrium = resourceBalances["yttrium"] !== undefined && 
        safeBigIntConversion(resourceBalances["yttrium"]) > 0n;
      metrics.gamePhaseIndicators.hasAdvancedResources = hasGraphene || hasYttrium;
        
      // Check for base resources
      const hasCarbon = resourceBalances["carbon"] !== undefined && 
        safeBigIntConversion(resourceBalances["carbon"]) > 0n;
      const hasNeodymium = resourceBalances["neodymium"] !== undefined && 
        safeBigIntConversion(resourceBalances["neodymium"]) > 0n;
      metrics.gamePhaseIndicators.hasBaseResources = hasCarbon || hasNeodymium;
        
      // Check for specific production capabilities
      metrics.gamePhaseIndicators.productionCapabilities.graphene = 
        resourceBalances["graphene"] !== undefined && 
        safeBigIntConversion(resourceBalances["graphene"]) > 0n;
        
      metrics.gamePhaseIndicators.productionCapabilities.yttrium = 
        resourceBalances["yttrium"] !== undefined && 
        safeBigIntConversion(resourceBalances["yttrium"]) > 0n;
        
      metrics.gamePhaseIndicators.productionCapabilities.he3 = 
        resourceBalances["helium3"] !== undefined && 
        safeBigIntConversion(resourceBalances["helium3"]) > 0n;
        
      // Calculate He3 percentage of total resources if available
      if (resourceAnalysis?.resources && !resourceAnalysis.error) {
        metrics.gamePhaseIndicators.he3Percentage = 
          resourceAnalysis.resources?.helium3?.percentage || 0;
      }
    }
    
    // Calculate activity distribution
    if (resourceAnalysis && !resourceAnalysis.error && resourceAnalysis.pathTotals) {
      metrics.activityDistribution.resource.graphenePath = resourceAnalysis.pathTotals.graphenePath?.percentage || 0;
      metrics.activityDistribution.resource.yttriumPath = resourceAnalysis.pathTotals.yttriumPath?.percentage || 0;
      metrics.activityDistribution.resource.he3Direct = resourceAnalysis.pathTotals.helium3?.percentage || 0;
    }
    
    if (liquidityAnalysis && !liquidityAnalysis.error && liquidityAnalysis.hasPositions) {
      // Calculate graphene path liquidity percentage
      const grapheneLiquidity = 
        (liquidityAnalysis.byResourceName?.carbon?.percentage || 0) +
        (liquidityAnalysis.byResourceName?.graphite?.percentage || 0) +
        (liquidityAnalysis.byResourceName?.graphene?.percentage || 0);
        
      // Calculate yttrium path liquidity percentage
      const yttriumLiquidity = 
        (liquidityAnalysis.byResourceName?.neodymium?.percentage || 0) +
        (liquidityAnalysis.byResourceName?.dysprosium?.percentage || 0) +
        (liquidityAnalysis.byResourceName?.yttrium?.percentage || 0);
        
      // Calculate He3 liquidity percentage
      const he3Liquidity = liquidityAnalysis.byResourceName?.helium3?.percentage || 0;
      
      metrics.activityDistribution.liquidity.graphenePath = grapheneLiquidity;
      metrics.activityDistribution.liquidity.yttriumPath = yttriumLiquidity;
      metrics.activityDistribution.liquidity.he3Pairs = he3Liquidity;
    }
    
    if (stakingAnalysis && !stakingAnalysis.error && stakingAnalysis.hasPositions) {
      // Get farm percentages from staking analysis
      metrics.activityDistribution.staking.graphenePath = stakingAnalysis.byPath?.graphene?.percentage || 0;
      metrics.activityDistribution.staking.yttriumPath = stakingAnalysis.byPath?.yttrium?.percentage || 0;
      metrics.activityDistribution.staking.he3Production = stakingAnalysis.byFarmType?.he3Production?.percentage || 0;
      metrics.activityDistribution.staking.he3Direct = stakingAnalysis.byFarmType?.he3Staking?.percentage || 0;
    }
    
    // Calculate composite strategy metrics
    
    // Game stage (0-100, higher = later stage)
    // Factors: He3 balance, advanced resources, production capabilities
    let gameStageScore = 0;
    
    // He3 balance factor (max 50 points)
    const thresholdMultiplier = 700000000000000000000000n; // Adjust as needed
    const he3Factor = he3BalanceValue > 0n
      ? Math.min(50, Number((he3BalanceValue * 50n) / thresholdMultiplier))
      : 0;
    
    // Resource development factor (max 50 points)
    let developmentScore = 0;
    if (metrics.gamePhaseIndicators.hasBaseResources) developmentScore += 10;
    if (metrics.gamePhaseIndicators.hasIntermediateResources) developmentScore += 15;
    if (metrics.gamePhaseIndicators.hasAdvancedResources) developmentScore += 25;
    
    metrics.compositeMetrics.gameStage = he3Factor + developmentScore;
    
    // Resource optimization (0-100)
    if (resourceAnalysis && !resourceAnalysis.error) {
      const resourceCount = Object.keys(resourceAnalysis.resources || {}).length;
      const dominantResourcePercentage = resourceAnalysis.dominantResources?.[0]?.percentage || 0;
      
      metrics.compositeMetrics.resourceOptimization = 
        Math.min(100, dominantResourcePercentage * 1.5 - (resourceCount > 3 ? (resourceCount - 3) * 10 : 0));
    }
    
    // Vertical integration (0-100)
    // Higher when the agent has resources at multiple stages of the same path
    const grapheneIntegration = 
      (metrics.gamePhaseIndicators.hasBaseResources ? 20 : 0) +
      (resourceBalances["graphite"] && safeBigIntConversion(resourceBalances["graphite"]) > 0n ? 30 : 0) +
      (resourceBalances["graphene"] && safeBigIntConversion(resourceBalances["graphene"]) > 0n ? 50 : 0);
      
    const yttriumIntegration = 
      (metrics.gamePhaseIndicators.hasBaseResources ? 20 : 0) +
      (resourceBalances["dysprosium"] && safeBigIntConversion(resourceBalances["dysprosium"]) > 0n ? 30 : 0) +
      (resourceBalances["yttrium"] && safeBigIntConversion(resourceBalances["yttrium"]) > 0n ? 50 : 0);
      
    metrics.compositeMetrics.verticalIntegration = Math.max(grapheneIntegration, yttriumIntegration);
    
    // Liquidity efficiency (0-100)
    if (liquidityAnalysis && !liquidityAnalysis.error && liquidityAnalysis.hasPositions) {
      metrics.compositeMetrics.liquidityEfficiency = 
        liquidityAnalysis.strategyIndicators?.advancedResourceFocus || 0;
    }
    
    // Yield generation (0-100)
    if (stakingAnalysis && !stakingAnalysis.error && stakingAnalysis.hasPositions) {
      metrics.compositeMetrics.yieldGeneration = 
        stakingAnalysis.strategyIndicators?.he3GenerationPotential || 0;
    }
    
    // Path specialization (-100 to 100)
    // Combine path focus across resources, liquidity, and staking
    const resourcePathFocus = resourceAnalysis && !resourceAnalysis.error ? 
      ((resourceAnalysis.pathTotals?.graphenePath?.percentage || 0) - 
       (resourceAnalysis.pathTotals?.yttriumPath?.percentage || 0)) * 2 : 0;
       
    const liquidityPathFocus = liquidityAnalysis && !liquidityAnalysis.error && liquidityAnalysis.hasPositions ? 
      liquidityAnalysis.strategyIndicators?.pathFocus || 0 : 0;
      
    const stakingPathFocus = stakingAnalysis && !stakingAnalysis.error && stakingAnalysis.hasPositions ? 
      stakingAnalysis.strategyIndicators?.pathFocus || 0 : 0;
    
    // Calculate weighted average if data is available
    let pathFocusCount = 0;
    let pathFocusSum = 0;
    
    if (resourcePathFocus !== 0) {
      pathFocusSum += resourcePathFocus;
      pathFocusCount++;
    }
    
    if (liquidityPathFocus !== 0) {
      pathFocusSum += liquidityPathFocus;
      pathFocusCount++;
    }
    
    if (stakingPathFocus !== 0) {
      pathFocusSum += stakingPathFocus;
      pathFocusCount++;
    }
    
    metrics.compositeMetrics.pathSpecialization = 
      pathFocusCount > 0 ? Math.round(pathFocusSum / pathFocusCount) : 0;
    
    // He3 focus (0-100)
    const he3ResourceFocus = metrics.activityDistribution.resource.he3Direct;
    const he3LiquidityFocus = metrics.activityDistribution.liquidity.he3Pairs;
    const he3StakingFocus = 
      metrics.activityDistribution.staking.he3Direct + 
      (metrics.activityDistribution.staking.he3Production * 0.5);
      
    metrics.compositeMetrics.he3Focus = 
      (he3ResourceFocus * 0.3) + (he3LiquidityFocus * 0.3) + (he3StakingFocus * 0.4);
    
    // Strategic diversity (0-100)
    // Higher when agent engages in multiple types of activities
    let diversityScore = 0;
    
    // Resource diversity
    if (resourceAnalysis && !resourceAnalysis.error) {
      const resourceTypes = Object.keys(resourceAnalysis.resources || {})
        .filter(r => (resourceAnalysis.resources[r]?.percentage || 0) > 5).length;
      diversityScore += Math.min(30, resourceTypes * 5);
    }
    
    // Liquidity diversity
    if (liquidityAnalysis && !liquidityAnalysis.error && liquidityAnalysis.hasPositions) {
      diversityScore += Math.min(35, liquidityAnalysis.strategyIndicators?.resourceDiversification || 0);
    }
    
    // Staking diversity
    if (stakingAnalysis && !stakingAnalysis.error && stakingAnalysis.hasPositions) {
      diversityScore += Math.min(35, stakingAnalysis.strategyIndicators?.yieldFarmingIntensity || 0);
    }
    
    metrics.compositeMetrics.strategicDiversity = diversityScore;
    
    return metrics;
  } catch (error) {
    console.error("Error determining overall strategy:", error);
    return { error: "Analysis error", message: (error as Error).message };
  }
}

/**
 * Provides competitive analysis data for creative counter-strategy development
 * @param resourceBalances Record of resource balances
 * @param liquidityPositions Liquidity positions data
 * @param stakePositions Staking positions data
 * @param he3Balance He3 token balance
 * @returns An object with detailed competitive analysis for creative counter-strategy development
 */
export function suggestCounterStrategies(
  resourceBalances: Record<string, string>,
  liquidityPositions: any,
  stakePositions: any,
  he3Balance: string
): any {
  try {
    // Analyze opponent's strategy comprehensively
    const resourceAnalysis = analyzeResourceFocus(resourceBalances);
    const pathAnalysis = analyzePathPreference(resourceBalances, liquidityPositions, stakePositions);
    const liquidityAnalysis = analyzeLiquidityStrategy(liquidityPositions);
    const stakingAnalysis = analyzeStakingStrategy(stakePositions);
    const overallStrategy = determineOverallStrategy(resourceBalances, liquidityPositions, stakePositions, he3Balance);
    
    // Convert He3 balance to BigInt safely
    const he3BalanceValue = safeBigIntConversion(he3Balance);
    
    // Prepare competitive analysis metrics
    const analysis = {
      competitorProfile: {
        he3Balance: he3BalanceValue.toString(),
        gameStage: overallStrategy.compositeMetrics?.gameStage || 0,
        dominantPath: pathAnalysis?.overall?.pathDominance > 0 ? "graphene" : 
                     pathAnalysis?.overall?.pathDominance < 0 ? "yttrium" : "balanced",
        pathDominanceScore: Math.abs(pathAnalysis?.overall?.pathDominance || 0),
        resourceFocus: resourceAnalysis?.dominantResources?.[0]?.name || "none",
        he3Focus: overallStrategy.compositeMetrics?.he3Focus || 0,
        liquidityActivity: liquidityAnalysis?.hasPositions || false,
        stakingActivity: stakingAnalysis?.hasPositions || false,
        diversificationLevel: overallStrategy.compositeMetrics?.strategicDiversity || 0,
        resourceOptimizationLevel: overallStrategy.compositeMetrics?.resourceOptimization || 0,
        verticalIntegrationLevel: overallStrategy.compositeMetrics?.verticalIntegration || 0
      },
      competitiveOpportunities: {
        resourceGaps: [] as string[],
        pathOpportunities: [] as string[],
        liquidityOpportunities: [] as string[],
        stakingOpportunities: [] as string[],
        he3ProductionOpportunities: [] as string[]
      },
      strategicVulnerabilities: {
        resourceVulnerabilities: [] as string[],
        pathVulnerabilities: [] as string[],
        liquidityVulnerabilities: [] as string[],
        stakingVulnerabilities: [] as string[],
        he3Vulnerabilities: [] as string[]
      },
      counterStrategyFactors: {
        resourceCompetition: {
          shouldCompeteDirectly: false,
          shouldTargetAlternativePath: false,
          shouldFocusOnUnderservedResources: false,
          targetResources: [] as string[]
        },
        liquidityStrategy: {
          shouldProvideLiquidity: false,
          targetPairs: [] as string[],
          shouldUndercut: false
        },
        stakingStrategy: {
          shouldStake: false,
          targetFarms: [] as string[],
          shouldFocusYield: false
        },
        he3Strategy: {
          shouldFocusHe3Production: false,
          shouldFocusHe3Staking: false,
          he3MiningEfficiency: 0
        }
      },
      rawAnalysisData: {
        resourceAnalysis,
        pathAnalysis,
        liquidityAnalysis,
        stakingAnalysis,
        overallStrategy
      }
    };
    
    // Identify resource gaps and opportunities
    if (resourceAnalysis && !resourceAnalysis.error) {
      // Check if competitor is heavily focused on one resource type
      const dominantResource = resourceAnalysis.dominantResources?.[0];
      if (dominantResource && dominantResource.percentage > 50) {
        analysis.strategicVulnerabilities.resourceVulnerabilities.push(
          `Heavily dependent on ${dominantResource.name} (${dominantResource.percentage}%)`
        );
        
        // Check which path the dominant resource belongs to
        if (["carbon", "graphite", "graphene"].includes(dominantResource.name)) {
          analysis.competitiveOpportunities.resourceGaps.push("Opportunity in yttrium path resources");
          analysis.counterStrategyFactors.resourceCompetition.targetResources.push("neodymium", "dysprosium", "yttrium");
          analysis.counterStrategyFactors.resourceCompetition.shouldTargetAlternativePath = true;
        } 
        else if (["neodymium", "dysprosium", "yttrium"].includes(dominantResource.name)) {
          analysis.competitiveOpportunities.resourceGaps.push("Opportunity in graphene path resources");
          analysis.counterStrategyFactors.resourceCompetition.targetResources.push("carbon", "graphite", "graphene");
          analysis.counterStrategyFactors.resourceCompetition.shouldTargetAlternativePath = true;
        }
      } 
      else {
        // Competitor has balanced resources - may need to specialize
        analysis.competitiveOpportunities.resourceGaps.push("Opportunity to specialize for efficiency");
        analysis.counterStrategyFactors.resourceCompetition.shouldFocusOnUnderservedResources = true;
      }
      
      // Check for missing or low resource types
      const resourceNames = ["carbon", "graphite", "graphene", "neodymium", "dysprosium", "yttrium", "helium3"];
      const missingResources = resourceNames.filter(name => 
        !resourceAnalysis.resources?.[name] || 
        (resourceAnalysis.resources[name]?.percentage || 0) < 5
      );
      
      if (missingResources.length > 0) {
        analysis.strategicVulnerabilities.resourceVulnerabilities.push(
          `Low or missing resources: ${missingResources.join(', ')}`
        );
        analysis.counterStrategyFactors.resourceCompetition.targetResources.push(...missingResources);
      }
    }
    
    // Analyze path vulnerabilities and opportunities
    if (pathAnalysis && !pathAnalysis.error) {
      const pathDominance = pathAnalysis.overall?.pathDominance || 0;
      
      if (Math.abs(pathDominance) > 70) {
        // Heavily focused on one path
        const dominantPath = pathDominance > 0 ? "graphene" : "yttrium";
        const alternativePath = pathDominance > 0 ? "yttrium" : "graphene";
        
        analysis.strategicVulnerabilities.pathVulnerabilities.push(
          `Heavily dependent on ${dominantPath} path`
        );
        
        analysis.competitiveOpportunities.pathOpportunities.push(
          `Opportunity to dominate ${alternativePath} path with less competition`
        );
      } 
      else if (Math.abs(pathDominance) < 30) {
        // Balanced between paths - may lack specialization
        analysis.strategicVulnerabilities.pathVulnerabilities.push(
          "Lacks path specialization, potentially inefficient"
        );
        
        analysis.competitiveOpportunities.pathOpportunities.push(
          "Opportunity to specialize in either path for greater efficiency"
        );
      }
    }
    
    // Analyze liquidity vulnerabilities and opportunities
    if (liquidityAnalysis && !liquidityAnalysis.error) {
      if (!liquidityAnalysis.hasPositions) {
        analysis.strategicVulnerabilities.liquidityVulnerabilities.push(
          "No liquidity positions established"
        );
        
        analysis.competitiveOpportunities.liquidityOpportunities.push(
          "Opportunity to establish key liquidity positions before competitor"
        );
        
        analysis.counterStrategyFactors.liquidityStrategy.shouldProvideLiquidity = true;
      } 
      else {
        // Check for concentration in specific resource types
        const resourceTypes = liquidityAnalysis.byResourceType;
        
        if (resourceTypes.advanced.percentage > 60) {
          analysis.strategicVulnerabilities.liquidityVulnerabilities.push(
            "Heavily focused on advanced resource liquidity, may neglect base pairs"
          );
          
          analysis.competitiveOpportunities.liquidityOpportunities.push(
            "Opportunity in base and intermediate resource liquidity pairs"
          );
          
          analysis.counterStrategyFactors.liquidityStrategy.targetPairs.push("carbon", "neodymium", "graphite", "dysprosium");
        } 
        else if (resourceTypes.base.percentage > 60) {
          analysis.strategicVulnerabilities.liquidityVulnerabilities.push(
            "Heavily focused on base resource liquidity, may neglect advanced pairs"
          );
          
          analysis.competitiveOpportunities.liquidityOpportunities.push(
            "Opportunity in advanced resource liquidity pairs"
          );
          
          analysis.counterStrategyFactors.liquidityStrategy.targetPairs.push("graphene", "yttrium", "helium3");
        }
        
        if (resourceTypes.he3.percentage < 10) {
          analysis.strategicVulnerabilities.liquidityVulnerabilities.push(
            "Limited He3 liquidity positioning"
          );
          
          analysis.competitiveOpportunities.liquidityOpportunities.push(
            "Opportunity in He3 liquidity provision"
          );
          
          analysis.counterStrategyFactors.liquidityStrategy.targetPairs.push("helium3");
        }
      }
    }
    
    // Analyze staking vulnerabilities and opportunities
    if (stakingAnalysis && !stakingAnalysis.error) {
      if (!stakingAnalysis.hasPositions) {
        analysis.strategicVulnerabilities.stakingVulnerabilities.push(
          "No staking positions established"
        );
        
        analysis.competitiveOpportunities.stakingOpportunities.push(
          "Opportunity to establish yield farming positions before competitor"
        );
        
        analysis.counterStrategyFactors.stakingStrategy.shouldStake = true;
      } 
      else {
        // Check for concentration in specific farm types
        const farmTypes = stakingAnalysis.byFarmType;
        
        if (farmTypes.baseResource.percentage > 60) {
          analysis.strategicVulnerabilities.stakingVulnerabilities.push(
            "Heavily focused on base resource staking, may neglect advanced farms"
          );
          
          analysis.competitiveOpportunities.stakingOpportunities.push(
            "Opportunity in advanced resource and He3 production farms"
          );
          
          analysis.counterStrategyFactors.stakingStrategy.targetFarms.push("gph", "y", "he3");
        } 
        else if (farmTypes.intermediateResource.percentage > 60) {
          analysis.strategicVulnerabilities.stakingVulnerabilities.push(
            "Heavily focused on intermediate resource staking"
          );
          
          analysis.competitiveOpportunities.stakingOpportunities.push(
            "Opportunity in base resource and He3 production farms"
          );
          
          analysis.counterStrategyFactors.stakingStrategy.targetFarms.push("grp", "dy", "he3");
        }
        
        if (farmTypes.he3Staking.percentage < 10 && farmTypes.he3Production.percentage < 10) {
          analysis.strategicVulnerabilities.stakingVulnerabilities.push(
            "Limited focus on He3 yield farming"
          );
          
          analysis.competitiveOpportunities.stakingOpportunities.push(
            "Opportunity in He3 production and direct staking"
          );
          
          analysis.counterStrategyFactors.stakingStrategy.shouldFocusYield = true;
          analysis.counterStrategyFactors.he3Strategy.shouldFocusHe3Staking = true;
        }
      }
    }
    
    // Analyze He3 production vulnerabilities and opportunities
    if (overallStrategy && !overallStrategy.error) {
      const he3Focus = overallStrategy.compositeMetrics?.he3Focus || 0;
      const gameStage = overallStrategy.compositeMetrics?.gameStage || 0;
      
      if (he3Focus < 30) {
        analysis.strategicVulnerabilities.he3Vulnerabilities.push(
          "Limited focus on He3 production and accumulation"
        );
        
        analysis.competitiveOpportunities.he3ProductionOpportunities.push(
          "Opportunity to prioritize He3 production strategy"
        );
        
        analysis.counterStrategyFactors.he3Strategy.shouldFocusHe3Production = true;
      }
      
      if (gameStage > 70 && he3Focus < 50) {
        analysis.strategicVulnerabilities.he3Vulnerabilities.push(
          "Late-game stage without strong He3 focus"
        );
        
        analysis.competitiveOpportunities.he3ProductionOpportunities.push(
          "Opportunity to accelerate He3 production in late game"
        );
        
        analysis.counterStrategyFactors.he3Strategy.shouldFocusHe3Production = true;
        analysis.counterStrategyFactors.he3Strategy.shouldFocusHe3Staking = true;
      }
    }
    
    // Calculate He3 mining efficiency potential (0-100)
    // Higher when targeting complementary strategies to the competitor
    const pathFocus = pathAnalysis?.overall?.pathDominance || 0;
    const stageFocus = overallStrategy?.compositeMetrics?.productionChainStage || 0;
    
    let efficiencyScore = 50; // Base score
    
    // Adjust based on path differentiation
    if (Math.abs(pathFocus) > 50) {
      // Competitor has strong path preference, going opposite is efficient
      efficiencyScore += 25;
    } else {
      // Competitor has balanced paths, specialization is key
      efficiencyScore += 15;
    }
    
    // Adjust based on stage focus
    if (stageFocus < 30) {
      // Competitor focuses on early stage, we should focus later
      efficiencyScore += 20;
    } else if (stageFocus > 70) {
      // Competitor focuses on late stage, we can either compete directly or go alternative
      efficiencyScore += 10;
    }
    
    analysis.counterStrategyFactors.he3Strategy.he3MiningEfficiency = Math.min(100, efficiencyScore);
    
    // Set high-level strategy flags based on analysis
    analysis.counterStrategyFactors.resourceCompetition.shouldCompeteDirectly = 
      analysis.competitorProfile.resourceOptimizationLevel < 50;
      
    analysis.counterStrategyFactors.liquidityStrategy.shouldProvideLiquidity = 
      !liquidityAnalysis?.hasPositions || liquidityAnalysis.strategyIndicators?.resourceDiversification < 40;
      
    analysis.counterStrategyFactors.liquidityStrategy.shouldUndercut = 
      liquidityAnalysis?.hasPositions && liquidityAnalysis.strategyIndicators?.resourceDiversification > 70;
      
    analysis.counterStrategyFactors.stakingStrategy.shouldStake = 
      !stakingAnalysis?.hasPositions || stakingAnalysis.strategyIndicators?.yieldFarmingIntensity < 40;
      
    analysis.counterStrategyFactors.he3Strategy.shouldFocusHe3Production = 
      overallStrategy?.compositeMetrics?.he3Focus < 40;
      
    analysis.counterStrategyFactors.he3Strategy.shouldFocusHe3Staking = 
      stakingAnalysis?.hasPositions && stakingAnalysis.strategyIndicators?.he3DirectStakingFocus < 30;
    
    return analysis;
  } catch (error) {
    console.error("Error suggesting counter strategies:", error);
    return { error: "Analysis error", message: (error as Error).message };
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
    
    const gameSessionId = await getGameSessionId();
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
        
        // Get agent's resource balances - ensure they're string values, not objects
        const resourceBalances: Record<string, string> = {};
        for (const [resourceName, resourceAddress] of Object.entries(resourceAddresses)) {
          try {
            const balance = await getTokenBalance(resourceAddress, agentAddress);
            // Ensure we're storing a string, not an object
            resourceBalances[resourceName] = balance.toString();
          } catch (error) {
            console.error(`Failed to get ${resourceName} balance for agent ${agentId}:`, error);
            resourceBalances[resourceName] = "Error";
          }
        }
        
        // Get agent's liquidity positions
        const liquidityPositionsResult = await executeQuery<LiquidityPositionsResponse>(GET_AGENT_LIQUIDITY_POSITIONS, {
          agentAddress: normalizeAddress(agentAddress),
          gameSessionId: gameSessionId
        });
        
        // Ensure liquidity positions are properly structured
        const processedLiquidityPositions = {
          liquidityPosition: liquidityPositionsResult?.liquidityPosition?.map(pos => ({
            ...pos,
            liquidity: typeof pos.liquidity === 'object' ? 
              (Object.values(pos.liquidity)[0] || "0").toString() : 
              (pos.liquidity || "0").toString()
          })) || []
        };
        
        // Get agent's stake positions
        const stakePositionsResult = await executeQuery<StakePositionsResponse>(GET_AGENT_STAKE_POSITIONS, {
          agentAddress: normalizeAddress(agentAddress),
          gameSessionId: gameSessionId
        });
        
        // Ensure stake positions are properly structured
        const processedStakePositions = {
          agentStake: stakePositionsResult?.agentStake?.map(stake => ({
            ...stake,
            stakedAmount: typeof stake.stakedAmount === 'object' ? 
              (Object.values(stake.stakedAmount)[0] || "0").toString() : 
              (stake.stakedAmount || "0").toString(),
            rewards: typeof stake.rewards === 'object' ? 
              (Object.values(stake.rewards)[0] || "0").toString() : 
              (stake.rewards || "0").toString()
          })) || []
        };
        
        // Store all intelligence for this agent
        competitiveIntelligence[agentId] = {
          agentId,
          address: agentAddress,
          he3Balance: typeof he3Balance === 'object' ? 
            (Object.values(he3Balance)[0] || "0").toString() : 
            he3Balance.toString(),
          resourceBalances,
          liquidityPositions: processedLiquidityPositions,
          stakePositions: processedStakePositions
        };
      } catch (error) {
        console.error(`Failed to get competitive intelligence for agent ${agentId}:`, error);
        competitiveIntelligence[agentId] = {
          agentId,
          address: agentAddress,
          he3Balance: "0",
          resourceBalances: {},
          liquidityPositions: { liquidityPosition: [] },
          stakePositions: { agentStake: [] },
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
    const gameSessionId = await getGameSessionId();
    const [currentAgentLiquidityPositions, targetAgentLiquidityPositions] = await Promise.all([
      executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
        agentAddress: normalizeAddress(currentAgentAddress),
        gameSessionId: gameSessionId
      }),
      executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
        agentAddress: normalizeAddress(targetAgentAddress),
        gameSessionId: gameSessionId
      })
    ]);

    // Get both agents' stake positions
    const [currentAgentStakePositions, targetAgentStakePositions] = await Promise.all([
      executeQuery(GET_AGENT_STAKE_POSITIONS, {
        agentAddress: normalizeAddress(currentAgentAddress),
        gameSessionId: gameSessionId
      }),
      executeQuery(GET_AGENT_STAKE_POSITIONS, {
        agentAddress: normalizeAddress(targetAgentAddress),
        gameSessionId: gameSessionId
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

/**
 * Provides creative strategy inspiration based on competitive analysis
 * @param competitorAnalysis The analysis result from suggestCounterStrategies
 * @returns An object with creative strategy seeds and inspiration elements
 */
export function generateStrategyInspiration(competitorAnalysis: any): any {
  try {
    if (!competitorAnalysis || competitorAnalysis.error) {
      return { error: "Invalid competitor analysis data" };
    }
    
    // Define strategy archetypes that can inspire creative thinking
    const strategyArchetypes = [
      {
        name: "Resource Specialist",
        description: "Focus intensely on optimizing one specific resource path",
        applicability: competitorAnalysis.competitorProfile.diversificationLevel > 60 ? "High" : "Medium",
        creativityPrompts: [
          "How might specialized resource production create unique advantages?",
          "What are the untapped efficiencies in a single resource path?",
          "Can a narrower focus outpace a diversified approach?"
        ]
      },
      {
        name: "Liquidity Monopolist",
        description: "Dominate liquidity in specific strategic pairs",
        applicability: !competitorAnalysis.competitorProfile.liquidityActivity ? "High" : 
          competitorAnalysis.strategicVulnerabilities.liquidityVulnerabilities.length > 0 ? "Medium" : "Low",
        creativityPrompts: [
          "How could controlling key liquidity points create strategic leverage?",
          "What trading pairs would give the most influential market position?",
          "Can liquidity positioning create resource acquisition advantages?"
        ]
      },
      {
        name: "Yield Maximizer",
        description: "Optimize for maximum yield generation across token types",
        applicability: competitorAnalysis.competitorProfile.he3Focus < 40 ? "High" : "Medium",
        creativityPrompts: [
          "What combinations of staking positions offer compound benefits?",
          "How might yield farming be timed with market dynamics?",
          "What would a yield-first approach look like throughout game phases?"
        ]
      },
      {
        name: "Counter-Path Innovator",
        description: "Develop resources specifically chosen to counter opponent's path",
        applicability: Math.abs(competitorAnalysis.competitorProfile.pathDominanceScore) > 60 ? "High" : "Medium",
        creativityPrompts: [
          "How might resource scarcity in their path create leverage?",
          "What unique advantages come from developing the less crowded path?",
          "How could resource trading be designed to benefit from their specialization?"
        ]
      },
      {
        name: "Vertical Integrator",
        description: "Control the entire supply chain for one specific path",
        applicability: competitorAnalysis.competitorProfile.verticalIntegrationLevel < 50 ? "High" : "Low",
        creativityPrompts: [
          "What efficiencies emerge from controlling all stages of a resource path?",
          "How might vertical integration protect against market disruptions?",
          "Can controlling a full path create unique He3 production benefits?"
        ]
      },
      {
        name: "Market Manipulator",
        description: "Strategically influence resource prices and market conditions",
        applicability: "Medium",
        creativityPrompts: [
          "How could strategic liquidity movements influence resource valuations?",
          "What timed market entries/exits might create resource accumulation opportunities?",
          "How might creating temporary resource scarcity be leveraged?"
        ]
      },
      {
        name: "He3 Rush Specialist",
        description: "Optimize all actions for fastest possible He3 accumulation",
        applicability: competitorAnalysis.competitorProfile.gameStage < 50 ? "High" : "Medium",
        creativityPrompts: [
          "What would a strategy optimized purely for He3 production look like?",
          "How could intermediate steps be minimized to accelerate He3 acquisition?",
          "What unusual resource conversion patterns might yield faster He3 generation?"
        ]
      },
      {
        name: "Adaptive Opportunist",
        description: "Constantly shift strategy to exploit competitor weaknesses",
        applicability: "High",
        creativityPrompts: [
          "How might a strategy that deliberately shifts focus create advantages?",
          "What monitoring mechanisms would identify optimal timing for strategy pivots?",
          "How could resource stockpiling enable rapid strategy adaptation?"
        ]
      }
    ];
    
    // Create competitor-specific strategy aspects based on vulnerability analysis
    const competitorSpecificAspects = [];
    
    // Add resource-based aspects
    if (competitorAnalysis.strategicVulnerabilities.resourceVulnerabilities.length > 0) {
      competitorSpecificAspects.push({
        aspect: "Resource Competition",
        inspiration: `The competitor shows vulnerabilities in resource balance: ${competitorAnalysis.strategicVulnerabilities.resourceVulnerabilities[0]}`,
        creativeAngles: [
          "How might creating artificial scarcity in their key resources benefit you?",
          "What resource acquisition strategy would most directly counter their focus?",
          "How could their resource imbalance create opportunities in market pricing?"
        ]
      });
    }
    
    // Add path-based aspects
    if (competitorAnalysis.strategicVulnerabilities.pathVulnerabilities.length > 0) {
      competitorSpecificAspects.push({
        aspect: "Path Strategy",
        inspiration: `Their path strategy shows weaknesses: ${competitorAnalysis.strategicVulnerabilities.pathVulnerabilities[0]}`,
        creativeAngles: [
          "How might specializing in the opposite path create strategic advantages?",
          "What resource conversion efficiencies might they be missing?",
          "How could cross-path resource trading be leveraged against their specialization?"
        ]
      });
    }
    
    // Add liquidity-based aspects
    if (competitorAnalysis.strategicVulnerabilities.liquidityVulnerabilities.length > 0) {
      competitorSpecificAspects.push({
        aspect: "Liquidity Strategy",
        inspiration: `Their liquidity positioning reveals opportunities: ${competitorAnalysis.strategicVulnerabilities.liquidityVulnerabilities[0]}`,
        creativeAngles: [
          "How could strategic liquidity provision create resource acquisition advantages?",
          "What price impact could you create by focusing on specific liquidity pairs?",
          "How might timing liquidity provision with their resource needs create leverage?"
        ]
      });
    }
    
    // Add staking-based aspects
    if (competitorAnalysis.strategicVulnerabilities.stakingVulnerabilities.length > 0) {
      competitorSpecificAspects.push({
        aspect: "Yield Farming Strategy",
        inspiration: `Their staking approach can be exploited: ${competitorAnalysis.strategicVulnerabilities.stakingVulnerabilities[0]}`,
        creativeAngles: [
          "What yield farming positions would complement their gaps?",
          "How might staking in their neglected farms create advantages?",
          "What timing strategies around staking rewards could be beneficial?"
        ]
      });
    }
    
    // Add He3-based aspects
    if (competitorAnalysis.strategicVulnerabilities.he3Vulnerabilities.length > 0) {
      competitorSpecificAspects.push({
        aspect: "He3 Production Strategy",
        inspiration: `Their He3 strategy shows weaknesses: ${competitorAnalysis.strategicVulnerabilities.he3Vulnerabilities[0]}`,
        creativeAngles: [
          "How could you accelerate He3 production to outpace them?",
          "What resource conversion path would optimize He3 generation?",
          "How might timing market entries around He3 price fluctuations be advantageous?"
        ]
      });
    }
    
    // Filter strategy archetypes by applicability
    const relevantArchetypes = strategyArchetypes
      .filter(archetype => archetype.applicability === "High")
      .slice(0, 3);
    
    // Add some medium applicability archetypes if we have fewer than 3
    if (relevantArchetypes.length < 3) {
      const mediumArchetypes = strategyArchetypes
        .filter(archetype => archetype.applicability === "Medium")
        .slice(0, 3 - relevantArchetypes.length);
      
      relevantArchetypes.push(...mediumArchetypes);
    }
    
    // Create synthesized strategy elements that combine insights
    const synthesizedElements = [];
    
    if (competitorAnalysis.competitorProfile.pathDominanceScore > 50) {
      synthesizedElements.push({
        concept: "Counter-Path Specialization",
        description: "Focus intensely on the Yttrium path to exploit their Graphene focus",
        creativityAngles: [
          "How might completely avoiding their dominant path create unique advantages?",
          "What resource efficiencies emerge when specializing in the less contested path?",
          "How could you leverage their path preference to create market advantages?"
        ]
      });
    } else if (competitorAnalysis.competitorProfile.pathDominanceScore < -50) {
      synthesizedElements.push({
        concept: "Counter-Path Specialization",
        description: "Focus intensely on the Graphene path to exploit their Yttrium focus",
        creativityAngles: [
          "How might completely avoiding their dominant path create unique advantages?",
          "What resource efficiencies emerge when specializing in the less contested path?",
          "How could you leverage their path preference to create market advantages?"
        ]
      });
    }
    
    // Game stage based strategy synthesis
    if (competitorAnalysis.competitorProfile.gameStage > 70) {
      synthesizedElements.push({
        concept: "Late-game Acceleration",
        description: "Optimize for direct He3 production and accumulation",
        creativityAngles: [
          "What would a pure He3 acquisition strategy look like at this stage?",
          "How might resource conversions be optimized for final-stage He3 generation?",
          "What timing strategies around market conditions could accelerate He3 gains?"
        ]
      });
    } else if (competitorAnalysis.competitorProfile.gameStage < 30) {
      synthesizedElements.push({
        concept: "Foundation Building",
        description: "Establish resource base and production infrastructure",
        creativityAngles: [
          "What early-game resource focus creates the strongest foundation?",
          "How might early liquidity positioning create long-term advantages?",
          "What unconventional early resource prioritization might yield benefits?"
        ]
      });
    }
    
    // Resource optimization based strategy synthesis
    if (competitorAnalysis.competitorProfile.resourceOptimizationLevel < 40) {
      synthesizedElements.push({
        concept: "Focused Efficiency",
        description: "Streamline resource focus to outcompete their diversified approach",
        creativityAngles: [
          "How could extreme specialization outpace their scattered approach?",
          "What resource efficiencies emerge from deep focus rather than breadth?",
          "How might timing resource conversions create competitive advantages?"
        ]
      });
    } else if (competitorAnalysis.competitorProfile.resourceOptimizationLevel > 70) {
      synthesizedElements.push({
        concept: "Diversification Advantage",
        description: "Develop multi-path capabilities to counter their specialization",
        creativityAngles: [
          "How might path diversification create resilience against market changes?",
          "What advantages come from maintaining flexibility across resource types?",
          "How could partial engagement across multiple paths create strategic options?"
        ]
      });
    }
    
    return {
      strategyArchetypes: relevantArchetypes,
      competitorSpecificInsights: competitorSpecificAspects,
      synthesizedElements: synthesizedElements,
      creativePrompts: {
        pathStrategy: [
          "How might a completely different path prioritization create unexpected advantages?",
          "What if resource conversion timing was treated as the primary strategic element?",
          "How could deliberately creating market scarcity in specific resources be leveraged?"
        ],
        marketDynamics: [
          "What unconventional liquidity pair might create unique market advantages?",
          "How could deliberately influencing price ratios between resources benefit your strategy?",
          "What if resource hoarding was used strategically to influence market conditions?"
        ],
        stakingApproach: [
          "What would a completely yield-optimized strategy look like, ignoring other factors?",
          "How might deliberately cycling between different staking positions create advantages?",
          "What if staking positions were used primarily as strategic market signals?"
        ],
        unconventionalIdeas: [
          "How might deliberately pursuing the same path as competitors create unexpected benefits?",
          "What if resource conversion was timed specifically to market conditions rather than need?",
          "How could creating artificial resource scarcity be used as a competitive strategy?"
        ]
      }
    };
  } catch (error) {
    console.error("Error generating strategy inspiration:", error);
    return { error: "Strategy inspiration generation error", message: (error as Error).message };
  }
}
