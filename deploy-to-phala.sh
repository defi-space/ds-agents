#!/bin/bash
# Script to deploy DeFi Space Agents to Phala Network
# Always deploys 4 agents

set -e

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}DeFi Space Agents - Phala TEE Deployment${NC}"
echo "=================================================="
echo -e "${GREEN}Configuration: Always running 4 agents in TEE environment${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker not found. Please install Docker first.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}.env file not found. Creating from template...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit the .env file with your configuration before proceeding.${NC}"
        exit 1
    else
        echo -e "${RED}.env.example file not found. Cannot continue.${NC}"
        exit 1
    fi
fi

# Verify environment variables
echo -e "${GREEN}Verifying environment variables...${NC}"
missing_vars=0
for var in AGENT1_PRIVATE_KEY AGENT1_ADDRESS AGENT2_PRIVATE_KEY AGENT2_ADDRESS AGENT3_PRIVATE_KEY AGENT3_ADDRESS AGENT4_PRIVATE_KEY AGENT4_ADDRESS STARKNET_RPC_URL GOOGLE_API_KEY; do
    if ! grep -q "^$var=" .env || grep -q "^$var=\"\"" .env; then
        echo -e "${RED}$var is not set in .env file${NC}"
        missing_vars=$((missing_vars+1))
    fi
done

if [ $missing_vars -gt 0 ]; then
    echo -e "${RED}$missing_vars required environment variables are missing. Please update your .env file.${NC}"
    exit 1
fi

# Set Phala environment variables
echo -e "${GREEN}Setting up Phala TEE environment...${NC}"
echo "PHALA_TEE=true" >> .env
echo "AGENT_COUNT=4" >> .env

# Ask for Phala-specific information
read -p "Enter your Phala Worker ID: " phala_worker_id
echo "PHALA_WORKER_ID=$phala_worker_id" >> .env

# Build Docker image
echo -e "${GREEN}Building Docker image...${NC}"
docker build -t defi-space-agents .

# Tag image for registry
read -p "Enter your Docker registry username (or leave empty to skip pushing): " registry_user
if [ ! -z "$registry_user" ]; then
    registry_image="$registry_user/defi-space-agents:latest"
    echo -e "${GREEN}Tagging image as $registry_image${NC}"
    docker tag defi-space-agents "$registry_image"
    
    echo -e "${GREEN}Pushing image to registry...${NC}"
    docker push "$registry_image"
    
    # Update phala-config.json with the registry image
    sed -i "s|\"image\": \"yourregistry/defi-space-agents:latest\"|\"image\": \"$registry_image\"|g" phala-config.json
    
    echo -e "${YELLOW}Please use the following image in your Phala deployment: $registry_image${NC}"
else
    echo -e "${YELLOW}Skipping Docker image push. You'll need to push the image manually.${NC}"
fi

# Phala deployment instructions
echo -e "${GREEN}Deployment instructions:${NC}"
echo -e "1. Ensure you have the Phala CLI installed and configured"
echo -e "2. Run the following command to deploy to Phala Network:"
echo -e "${YELLOW}   phala deploy --config phala-config.json --env-file .env${NC}"
echo -e "3. Monitor your deployment on the Phala dashboard"

echo -e "${GREEN}Preparation complete! Your agents are ready for deployment to Phala TEE.${NC}" 