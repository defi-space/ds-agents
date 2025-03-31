# ds-agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-orange)](https://bun.sh/)
[![Phala Network](https://img.shields.io/badge/Phala_TEE-Ready-brightgreen)](https://phala.network/)

A multi-agent system for Starknet blockchain interactions with isolated memory and configuration for each agent. This project enables autonomous agents to interact with Starknet contracts, manage resources, and execute complex strategies independently.

This project allows running multiple agents simultaneously, each with its own configuration for API keys, Starknet wallet addresses, and private keys. Each agent operates independently with isolated memory and blockchain interactions.

## Features

- Run up to 4 agents simultaneously in autonomous mode
- Each agent has isolated memory and vector storage
- Individual Starknet wallet configuration for each agent
- Support for both autonomous and manual (interactive) modes
- Color-coded console output for easy agent identification
- Chromadb vector storage for agent memory persistence
- MongoDB Atlas for persistent agent memory storage
- Phala Network TEE integration for enhanced security and privacy

## Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or higher)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) for running ChromaDB
- MongoDB Atlas account for database storage
- Starknet RPC access
- Google API keys for each agent

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/defi-space/ds-agents.git
   cd ds-agents
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Create your environment configuration:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your API keys, wallet addresses, private keys, and MongoDB Atlas credentials.

5. Start the required services:
   ```bash
   docker-compose up -d
   ```

## Environment Configuration

The `.env` file contains configuration for all agents. Each agent must have its own:
- Google API key
- Starknet wallet address
- Starknet private key

You must also configure MongoDB Atlas:
```
# MongoDB Atlas credentials
MONGODB_ATLAS_USER="your_username"
MONGODB_ATLAS_PASSWORD="your_password"
MONGODB_ATLAS_CLUSTER="your-cluster.mongodb.net"
```

Example:
```
# Agent 1 Configuration
AGENT1_PRIVATE_KEY="your-private-key"
AGENT1_ADDRESS="your-wallet-address"
AGENT1_API_KEY="your-google-api-key"

# Agent 2 Configuration
AGENT2_PRIVATE_KEY="your-private-key"
AGENT2_ADDRESS="your-wallet-address"
AGENT2_API_KEY="your-google-api-key"

# ... more agent configurations ...

# Starknet
STARKNET_RPC_URL="your-starknet-rpc-url"

# GraphQL Indexer
INDEXER_URL="http://your-indexer-url:8080/v1/graphql"

# Google API Key used for embedding in single agent mode
GOOGLE_API_KEY="your-google-api-key"
```

> **Important**: Each agent must have its own configuration. The system validates that proper credentials are provided for each agent at startup.

## Running Agents

### Run All Agents Simultaneously (Autonomous Mode)

```bash
bun run start-all
```

This will start all 4 agents in parallel, with output from each agent prefixed with its name. All agents will run in autonomous mode.

### Run a Specific Number of Agents

You can run a specific number of agents (from 2 to 4) using the following commands:

```bash
bun run start-agents-2  # Run 2 agents (agent1 and agent2)
bun run start-agents-3  # Run 3 agents (agent1, agent2, and agent3)
bun run start-agents-4  # Run 4 agents
```

You can also specify the number of agents directly:

```bash
bun run src/run-agents.ts 4  # Run 4 agents
```

### Run Individual Agents (Autonomous Mode)

You can also run agents individually in autonomous mode:

```bash
bun run start-agent1
bun run start-agent2
bun run start-agent3
bun run start-agent4
```

### Run an Agent in Manual Mode

To run an agent in manual mode (interactive CLI), add the `--manual` flag:

```bash
bun run src/agents/agent1.ts --manual
```

In manual mode:
- You'll get an interactive command prompt
- You can type messages and get responses from the agent
- The agent won't run autonomously
- Type `exit` to quit the session

## Architecture

### Agent Factory Pattern

The system uses a factory pattern to create agent instances with different configurations:

```
createAgent(config) → Agent Instance
```

Each agent:
1. Has its own memory store and vector store
2. Uses its own API key for AI model access
3. Uses its own Starknet wallet for blockchain interactions
4. Can run independently of other agents

### Memory Isolation

Each agent has its own isolated memory that is not shared with other agents:

- **Memory Store**: Each agent has its own MongoDB Atlas collection for conversation data
- **Vector Store**: Each agent has its own ChromaDB collection with a unique name based on the agent ID

This memory isolation ensures that:
- Agents don't interfere with each other's memory
- Each agent maintains its own state and context
- Agents can develop independent strategies and knowledge

### Starknet Integration

The `StarknetConfigStore` singleton maintains the configuration for each agent and ensures that blockchain operations use the correct wallet for each agent.

## Development

### Project Structure

```
ds-agents/
├── src/
│   ├── agents/           # Agent implementations
│   ├── actions/          # Available actions for agents
│   │   └── blockchain/   # Blockchain-specific actions
│   ├── contexts/         # Context definitions
│   ├── extensions/       # System extensions
│   ├── outputs/          # Output handlers
│   ├── prompts/          # Agent prompts
│   ├── utils/            # Utility functions
│   └── run-agents.ts     # Multi-agent runner
├── docker-compose.yaml   # Container configuration
├── .env.example          # Example environment configuration
├── package.json          # Project dependencies
├── contracts.json        # Contract addresses configuration
├── tsconfig.json         # TypeScript configuration
├── phala/                # Phala TEE deployment files
│   ├── Dockerfile        # Container definition for Phala TEE
│   ├── docker-compose.yml # Docker Compose for Phala deployment
│   ├── scripts/          # Scripts for startup and monitoring
│   ├── build-image.sh    # Script to build and push Docker images
│   ├── deploy-to-phala.sh # Script to deploy to Phala Network
│   └── README.md         # Phala deployment documentation
└── README.md             # This file
```

### Adding a New Agent

1. Create a new agent file in `src/agents/` (e.g., `agent4.ts`)
2. Add the agent's configuration to `.env`
3. Add a new script to `package.json` for running the agent
4. Update the agent runner if necessary

### Customizing Agent Behavior

Agent behavior can be customized by modifying:
- Context definitions in `src/contexts/`
- Available actions in `src/actions/`
- Prompts in `src/prompts/`

## Deployment

### Docker Deployment

The project includes Docker Compose configuration for running the required services:

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

#### Improved Docker Configuration

The Docker setup has been optimized with:

- **Health checks** for service dependencies
- **Resource allocation** with both limits and reservations
- **Improved startup scripts** with better error handling
- **Service profiles** to control which services start together
- **Network configuration** for secure inter-service communication

### Production Deployment Considerations

For production deployment:

1. Use environment-specific configuration files
2. Set up proper monitoring and alerting
3. Implement proper logging and error tracking
4. Consider using a process manager like PM2 for Node.js applications
5. Set up automatic restarts for failed processes
6. Implement proper backup strategies for databases

## Phala TEE Integration

This project supports deployment in [Phala Network's](https://phala.network/) Trusted Execution Environment (TEE), providing enhanced security, confidentiality, and verifiability for the agents.

### What is Phala Network?

Phala Network is a decentralized cloud that offers secure and privacy-preserving computation using Trusted Execution Environment (TEE) technology. 
TEEs provide an isolated and secure environment where code can be executed with confidentiality and integrity guarantees, even from the host system.

### Benefits of Running Agents in Phala TEE

- **Enhanced Security**: Your agents' private keys and sensitive state are protected within the TEE, inaccessible even to the host system
- **Data Confidentiality**: All agent data, including API keys and private keys, remains encrypted and inaccessible to external observers
- **Execution Integrity**: The computation logic cannot be tampered with by malicious hosts
- **Protected State**: Agent state is protected and only accessible to authorized parties
- **On-chain Attestation**: Provides auditable logs of off-chain computations, ensuring integrity and transparency

### Phala TEE Setup Requirements

- Docker and Docker Compose installed
- A Phala Network account and access to the Phala Cloud
- Docker container registry account (Docker Hub, GitHub Container Registry, etc.)
- Your agent credentials (API keys, wallet addresses, private keys)

### Deploying to Phala TEE

The deployment process has been split into two separate steps for better organization:

1. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   # Edit the .env file with your agent credentials
   ```

2. **Set Up GitHub Container Registry Access**:
   - Create a GitHub Personal Access Token (PAT) with `write:packages` permissions
   - Log in to GitHub Container Registry:
     ```bash
     docker login ghcr.io -u YOUR_GITHUB_USERNAME -p YOUR_GITHUB_PAT
     ```

3. **Build and Push Docker Image**:
   ```bash
   chmod +x phala/build-image.sh
   ./phala/build-image.sh
   ```
   - When prompted, provide your GitHub username
   - Choose whether to make your container image public or private

4. **Deploy to Phala Network**:
   ```bash
   chmod +x phala/deploy-to-phala.sh
   ./phala/deploy-to-phala.sh
   ```
   - The script will guide you through the deployment process
   - Provide your Phala Worker ID when prompted

5. **Monitor Your Deployment**:
   - Use Phala's dashboard to monitor your agents' health and resource usage
   - Set up alerts for any issues or performance degradation

For more detailed information, refer to the documentation in the `phala` directory.

### Phala Configuration

The project includes pre-configured files for Phala deployment in the `phala` directory:

- **Dockerfile**: Containerizes your agents for TEE deployment
- **docker-compose.yml**: Defines services, resource requirements, and environment settings
- **scripts/**: Contains startup and monitoring scripts for the container
- **build-image.sh**: Script to build and push Docker images to GitHub Container Registry
- **deploy-to-phala.sh**: Script to deploy the built image to Phala Network

This separation of concerns makes it easier to manage the Docker build process separately from the Phala deployment process. The project uses Docker Compose for deployment, which allows for running multiple services together (agents and ChromaDB) within the same Confidential Virtual Machine (CVM).

### Security Considerations for TEE Deployment

When deploying agents that handle private keys and sensitive operations in a TEE:

1. **Key Management**: Private keys should be securely provisioned to the TEE environment
2. **Attestation**: Verify the authenticity of the TEE environment before sending sensitive data
3. **Secure Communication**: Ensure that communication channels to and from the TEE are encrypted

### Additional Phala Resources

- [Phala Network Documentation](https://docs.phala.network/)
- [Phala Cloud Dashboard](https://cloud.phala.networkthg)
- [TEE Security Best Practices](https://docs.phala.network/overview/phala-network)

## Troubleshooting

### Common Issues

1. **Agent fails to start**:
   - Check that all required environment variables are set in `.env`
   - Ensure that the API keys are valid
   - Verify that the Starknet RPC URL is accessible

2. **ChromaDB connection errors**:
   - Ensure Docker is running
   - Check that the ChromaDB container is up (`docker-compose ps`)
   - Verify that port 8000 is accessible

3. **Starknet transaction errors**:
   - Verify that the wallet addresses and private keys are correctly formatted
   - Check that the wallets have sufficient funds
   - Ensure the Starknet RPC URL is valid and accessible

### Logs

For detailed logs, run agents with the `DEBUG` environment variable:

```bash
DEBUG=* bun run start-agent1
```

## Security Considerations

- **API Keys**: Never commit API keys to version control
- **Private Keys**: Store private keys securely and never expose them
- **Environment Variables**: Use environment variables for sensitive information
- **Access Control**: Implement proper access control for APIs and services
- **Input Validation**: Validate all inputs to prevent injection attacks
- **Rate Limiting**: Implement rate limiting to prevent abuse
- **Logging**: Ensure sensitive information is never logged in production environments

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

# MongoDB Atlas Configuration

To use MongoDB Atlas instead of local MongoDB:

1. Create an Atlas account and cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Add your credentials to your `.env` file:

```
# MongoDB Atlas credentials
MONGODB_ATLAS_USER="your_username"
MONGODB_ATLAS_PASSWORD="your_password"
MONGODB_ATLAS_CLUSTER="your-cluster.mongodb.net"
```

The connection string is built automatically in the code without storing the full URI in environment variables. This approach keeps only the necessary credentials in your environment configuration and constructs the connection string when needed.
