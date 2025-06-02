import { gql } from "graphql-request";

// AMM Queries
export const GET_PAIR_INFO = gql`
  query GetPairInfo($address: String!, $gameSessionId: Int!) {
    pair(where: { address: { _eq: $address }, gameSessionId: { _eq: $gameSessionId } }) {
      address
      factoryAddress
      token0Address
      token1Address
      reserve0
      reserve1
      totalSupply
      gameSessionId
      factory {
        address
        owner
        feeTo
      }
    }
  }
`;

export const GET_FARM_INFO = gql`
  query GetFarmInfo($address: String!, $gameSessionId: Int!) {
    farm(where: { address: { _eq: $address }, gameSessionId: { _eq: $gameSessionId } }) {
      address
      factoryAddress
      lpTokenAddress
      totalStaked
      owner
      activeRewards
      penaltyDuration
      multiplier
      withdrawPenalty
      penaltyReceiver
      gameSessionId
      rewardEvents(order_by: { createdAt: desc }, limit: 1) {
        transactionHash
        eventType
        rewardToken
        rewardAmount
        rewardDuration
        rewardRate
        periodFinish
        createdAt
      }
    }
  }
`;

export const GET_ALL_FARMS = gql`
  query GetAllFarms($gameSessionId: Int!) {
    farm(where: { gameSessionId: { _eq: $gameSessionId } }) {
      address
      factoryAddress
      farmIndex
      lpTokenAddress
      totalStaked
      activeRewards
      penaltyDuration
      withdrawPenalty
      penaltyReceiver
      gameSessionId
      rewardEvents(order_by: { createdAt: desc }, limit: 1) {
        rewardToken
        rewardAmount
        rewardDuration
        rewardRate
        periodFinish
      }
    }
  }
`;

export const GET_AGENT_LIQUIDITY_POSITIONS = gql`
  query GetAgentLiquidityPositions($agentAddress: String!, $gameSessionId: Int!) {
    liquidityPosition(
      where: { 
        agentAddress: { _eq: $agentAddress },
        pair: { gameSessionId: { _eq: $gameSessionId } }
      }
    ) {
      pairAddress
      agentAddress
      liquidity
      depositsToken0
      depositsToken1
      withdrawalsToken0
      withdrawalsToken1
      pair {
        token0Address
        token1Address
        reserve0
        reserve1
        totalSupply
        gameSessionId
      }
    }
  }
`;

export const GET_AGENT_STAKE_POSITIONS = gql`
  query GetAgentStakePositions($agentAddress: String!, $gameSessionId: Int!) {
    agentStake(
      where: { 
        agentAddress: { _eq: $agentAddress },
        farm: { gameSessionId: { _eq: $gameSessionId } }
      }
    ) {
      farmAddress
      agentAddress
      stakedAmount
      penaltyEndTime
      rewardPerTokenPaid
      rewards
      rewardStates {
        rewardTokenAddress
        lastPendingRewards
        rewardPerTokenPaid
      }
      farm {
        lpTokenAddress
        totalStaked
        activeRewards
        penaltyDuration
        withdrawPenalty
        gameSessionId
      }
    }
  }
`;

export const GET_FARM_INDEX_BY_LP_TOKEN = gql`
  query GetFarmIndexByLpToken($lpTokenAddress: String!, $gameSessionId: Int!) {
    farm(where: { 
      lpTokenAddress: { _eq: $lpTokenAddress },
      gameSessionId: { _eq: $gameSessionId }
    }) {
      farmIndex
    }
  }
    
`;

// Game Session Queries
export const GET_GAME_SESSION_STATUS = gql`
  query GetGameSessionStatus($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      address
      tokenWinConditionAddress
      tokenWinConditionThreshold
      gameSuspended
      gameOver
      winningAgentIndex
      gameSessionIndex
    }
  }
`;

export const GET_GAME_SESSION_INDEX_BY_ADDRESS = gql`
  query GetGameSessionIndexByAddress($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      gameSessionIndex
    }
  }
`;

export const GET_GAME_SESSION_INFO = gql`
  query GetGameSessionInfo($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      gameFactory
      gameSessionIndex
      agentsList
    }
  }
`;

export const GET_MOST_STAKED_AGENTS = gql`
  query GetMostStakedAgents($sessionAddress: String!, $limit: Int = 5) {
    userStake(
      where: { sessionAddress: { _eq: $sessionAddress } }
      order_by: { amount: desc }
      limit: $limit
    ) {
      agentIndex
      userAddress
      amount
    }
  }
`;
