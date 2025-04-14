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
      factory {
        address
        owner
        feeTo
      }
    }
  }
`;

export const GET_FARM_INFO = gql`
  query GetFarmInfo($address: String!) {
    farm(where: { address: { _eq: $address } }) {
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
  query GetAllFarms {
    farm {
      address
      factoryAddress
      farmIndex
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

export const GET_AGENT_LIQUIDITY_POSITIONS = gql`
  query GetAgentLiquidityPositions($agentAddress: String!) {
    liquidityPosition(where: { agentAddress: { _eq: $agentAddress } }) {
      id
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
      }
    }
  }
`;

export const GET_AGENT_STAKE_POSITIONS = gql`
  query GetAgentStakePositions($agentAddress: String!) {
    agentStake(where: { agentAddress: { _eq: $agentAddress } }) {
      id
      farmAddress
      agentAddress
      stakedAmount
      penaltyEndTime
      rewardPerTokenPaid
      rewards
      farm {
        lpTokenAddress
        totalStaked
        activeRewards
        penaltyDuration
        withdrawPenalty
      }
    }
  }
`;

export const GET_FARM_INDEX_BY_LP_TOKEN = gql`
  query GetFarmIndexByLpToken($lpTokenAddress: String!) {
    farm(where: { lpTokenAddress: { _eq: $lpTokenAddress } }) {
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
      gameSuspended
      gameOver
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

// Faucet Queries
export const GET_FAUCET_INFO = gql`
  query GetFaucetInfo($address: String!) {
    faucet(where: { address: { _eq: $address } }) {
      address
      owner
      claimInterval
      gameSessionId
      tokensList
      createdAt
      updatedAt
      tokens {
        address
        amount
        claimAmount
      }
    }
  }
`;

export const GET_WHITELISTED_USER = gql`
  query GetWhitelistedUser($userAddress: String!, $faucetAddress: String!) {
    whitelistedUser(
      where: { 
        address: { _eq: $userAddress },
        faucetAddress: { _eq: $faucetAddress }
      }
    ) {
      address
      faucetAddress
      isWhitelisted
      lastClaim
      createdAt
      updatedAt
    }
  }
`;

export const GET_USER_CLAIM_HISTORY = gql`
  query GetUserClaimHistory($userAddress: String!) {
    claimEvent(
      where: { userAddress: { _eq: $userAddress } }
      order_by: { createdAt: desc }
    ) {
      id
      transactionHash
      userAddress
      tokenAddress
      faucetAddress
      amount
      createdAt
    }
  }
`; 