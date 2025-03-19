#!/bin/bash
# Script to deploy DeFi Space Agents to Phala Network
# Handles the Phala-specific deployment steps after image is built

set -e

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}DeFi Space Agents - Phala TEE Deployment${NC}"
echo "=================================================="
echo -e "${GREEN}This script handles the Phala-specific deployment steps${NC}"

# Navigate to project root (assuming script is in phala-deploy directory)
cd "$(dirname "$0")/.."

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

# Set Phala environment variables if they don't exist already
if ! grep -q "^PHALA_TEE=" .env; then
    echo -e "${GREEN}Setting up Phala TEE environment variables...${NC}"
    echo "PHALA_TEE=true" >> .env
    echo "AGENT_COUNT=4" >> .env
fi

# Ask for Phala-specific information
read -p "Enter your Phala Worker ID: " phala_worker_id
if [ ! -z "$phala_worker_id" ]; then
    # Only add if not already in .env
    if ! grep -q "^PHALA_WORKER_ID=" .env; then
        echo "PHALA_WORKER_ID=$phala_worker_id" >> .env
    else
        # Update existing value
        sed -i "s/^PHALA_WORKER_ID=.*/PHALA_WORKER_ID=$phala_worker_id/" .env
    fi
fi

# Check if image reference exists in phala-config.json
if grep -q "YOUR_GITHUB_USERNAME" phala-deploy/phala-config.json; then
    echo -e "${YELLOW}Docker image not configured in phala-config.json.${NC}"
    echo -e "${YELLOW}Please run phala-deploy/build-image.sh first.${NC}"
    exit 1
fi

# Check if phala CLI is installed
if ! command -v phala &> /dev/null; then
    echo -e "${RED}Phala CLI not found. Please install the Phala CLI first.${NC}"
    echo -e "${YELLOW}Visit https://docs.phala.network/ for installation instructions.${NC}"
    exit 1
fi

# Phala deployment
echo -e "${GREEN}Deploying to Phala Network...${NC}"
echo -e "${YELLOW}Running: phala deploy --config phala-deploy/phala-config.json --env-file .env${NC}"

read -p "Would you like to proceed with deployment? (y/n): " proceed_deploy
if [ "$proceed_deploy" = "y" ]; then
    phala deploy --config phala-deploy/phala-config.json --env-file .env
    echo -e "${GREEN}Deployment initiated. Please check Phala Dashboard for status.${NC}"
else
    echo -e "${YELLOW}Deployment skipped. You can run the command manually when ready.${NC}"
fi

echo -e "${GREEN}Phala deployment process complete!${NC}"
echo -e "${YELLOW}Visit the Phala Dashboard to monitor your deployment.${NC}" 