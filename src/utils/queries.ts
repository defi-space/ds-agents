import { gql } from 'graphql-request';

// AMM Queries
export const GET_POOL_INFO = gql`
  query GetPoolInfo($address: String!) {
    pair(where: { address: { _eq: $address } }) {
      address
      factoryAddress
      token0Address
      token1Address
      reserve0
      reserve1
      totalSupply
      tvlUsd
      volume24h
      apy24h
      factory {
        address
        totalValueLockedUsd
        owner
        feeTo
      }
    }
  }
`;

export const GET_REACTOR_INFO = gql`
  query GetReactorInfo($address: String!) {
    reactor(where: { address: { _eq: $address } }) {
      address
      powerplantAddress
      lpTokenAddress
      totalStaked
      owner
      activeRewards
      penaltyDuration
      multiplier
      withdrawPenalty
      penaltyReceiver
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

export const GET_ALL_REACTORS = gql`
  query GetAllReactors {
    reactor {
      address
      powerplantAddress
      reactorIndex
      lpTokenAddress
      totalStaked
      activeRewards
      penaltyDuration
      withdrawPenalty
      penaltyReceiver
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

export const GET_USER_LIQUIDITY_POSITIONS = gql`
  query GetUserLiquidityPositions($userAddress: String!) {
    liquidityPosition(where: { userAddress: { _eq: $userAddress } }) {
      id
      pairAddress
      userAddress
      liquidity
      depositsToken0
      depositsToken1
      withdrawalsToken0
      withdrawalsToken1
      usdValue
      apyEarned
      pair {
        token0Address
        token1Address
        reserve0
        reserve1
        totalSupply
        tvlUsd
      }
    }
  }
`;

export const GET_USER_STAKE_POSITIONS = gql`
  query GetUserStakePositions($userAddress: String!) {
    userStake(where: { userAddress: { _eq: $userAddress } }) {
      id
      reactorAddress
      userAddress
      stakedAmount
      rewards
      penaltyEndTime
      rewardPerTokenPaid
      reactor {
        lpTokenAddress
        totalStaked
        activeRewards
        penaltyDuration
        withdrawPenalty
      }
    }
  }
`;

export const GET_REACTOR_INDEX_BY_LP_TOKEN = gql`
  query GetReactorIndexByLpToken($lpTokenAddress: String!) {
    reactor(where: { lpTokenAddress: { _eq: $lpTokenAddress } }) {
      reactorIndex
    }
  }
`;

// Game Session Queries - Simplified as requested

export const GET_GAME_SESSION_STATUS = gql`
  query GetGameSessionStatus($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      address
      tokenWinConditionAddress
      tokenWinConditionThreshold
      isSuspended
      isOver
      winningAgentIndex
    }
  }
`;

export const GET_GAME_SESSION_INDEX_BY_ADDRESS = gql`
  query GetGameSessionIndexByAddress($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      sessionIndex
    }
  }
`;

export const GET_MOST_STAKED_AGENTS = gql`
  query GetMostStakedAgents($sessionAddress: String!, $limit: Int = 5) {
    userGameStake(
      where: { sessionAddress: { _eq: $sessionAddress } }
      order_by: { stakedAmount: desc }
      limit: $limit
    ) {
      agentIndex
      userAddress
      stakedAmount
    }
  }
`; 