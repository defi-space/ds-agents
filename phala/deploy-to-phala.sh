#!/bin/bash
# Script to deploy DeFi Space Agents to Phala Network
# Handles the Phala-specific deployment steps after image is built

set -e

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Add trap to restore .env from backup if script exits abnormally
cleanup() {
  if [ -f .env.backup ]; then
    echo -e "${YELLOW}Restoring .env from backup...${NC}"
    cp .env.backup .env
    rm .env.backup
  fi
}

# Set trap for script exit
trap cleanup EXIT

echo -e "${YELLOW}defi-space-agents - Phala TEE Deployment${NC}"
echo "=================================================="
echo -e "${GREEN}This script handles the Phala-specific deployment steps${NC}"

# Navigate to project root (assuming script is in phala directory)
cd "$(dirname "$0")/.."

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}.env file not found. Creating from template...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${RED}Created .env file from template. Please edit with your configuration and run again.${NC}"
        exit 1
    else
        echo -e "${RED}.env.example file not found. Cannot continue.${NC}"
        exit 1
    fi
fi

# Make a backup of the original .env file before processing
cp .env .env.backup

# Instead of processing the .env file, we'll just check if the required keys exist
echo -e "${GREEN}Checking for required environment variables...${NC}"

# Verify environment variables
echo -e "${GREEN}Verifying environment variables...${NC}"
missing_vars=0
for var in AGENT1_PRIVATE_KEY AGENT1_ADDRESS AGENT1_API_KEY AGENT2_PRIVATE_KEY AGENT2_ADDRESS AGENT2_API_KEY AGENT3_PRIVATE_KEY AGENT3_ADDRESS AGENT3_API_KEY AGENT4_PRIVATE_KEY AGENT4_ADDRESS AGENT4_API_KEY STARKNET_RPC_URL INDEXER_URL GOOGLE_API_KEY FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY; do
    if ! grep -q "^$var=" .env; then
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
fi

# Check if image reference exists in docker-compose.yml
if grep -q "YOUR_GITHUB_USERNAME" phala/docker-compose.yml; then
    echo -e "${RED}Docker image not configured in docker-compose.yml.${NC}"
    echo -e "${RED}Please run phala/build-image.sh first.${NC}"
    exit 1
fi

# Check if phala CLI is installed
if ! command -v npx &> /dev/null; then
    echo -e "${RED}Node.js and NPX are required but not found. Please install Node.js first.${NC}"
    echo -e "${RED}Visit https://nodejs.org/ for installation instructions.${NC}"
    exit 1
fi

# Check for PHALA_API_KEY in .env file first
phala_api_key=""
if grep -q "^PHALA_API_KEY=" .env; then
    # Get the exact value without any processing/modification
    phala_api_key=$(grep "^PHALA_API_KEY=" .env | cut -d= -f2- | sed 's/[[:space:]]*#.*$//')
    
    # Check if it's empty after parsing
    if [ -z "$phala_api_key" ]; then
        echo -e "${RED}Found PHALA_API_KEY in .env but value appears to be empty${NC}"
        echo -e "${RED}Please add your Phala Cloud API Key to .env file and run again.${NC}"
        exit 1
    fi
fi

# If not found in .env or empty, check environment variable
if [ -z "$phala_api_key" ] && [ ! -z "$PHALA_API_KEY" ]; then
    phala_api_key="$PHALA_API_KEY"
fi

# If still not found, exit with error
if [ -z "$phala_api_key" ]; then
    echo -e "${RED}Phala Cloud API Key is required for deployment.${NC}"
    echo -e "${RED}You can generate one at https://cloud.phala.network by going to your profile > API Tokens.${NC}"
    echo -e "${RED}Then add it to your .env file as PHALA_API_KEY=your-key-here${NC}"
    exit 1
else
    echo -e "${GREEN}Using Phala API Key found in configuration${NC}"
fi

# Set the API key for this session
export PHALA_API_KEY="$phala_api_key"

# Log in with the Phala CLI
echo -e "${GREEN}Logging in to Phala Cloud...${NC}"

# Run login with error handling
if ! npx phala auth login "$phala_api_key"; then
    echo -e "${RED}Authentication failed. Please check the following:${NC}"
    echo -e "  1. Your API key is correct and not expired"
    echo -e "  2. You are using the correct Phala Cloud environment"
    echo -e "  3. Your network connection is stable"
    echo -e "  4. The Phala Cloud service is available"
    echo -e ""
    echo -e "${RED}Try these steps:${NC}"
    echo -e "  1. Go to https://cloud.phala.network/dashboard and verify your login works"
    echo -e "  2. Generate a new API key"
    echo -e "  3. Delete the PHALA_API_KEY line from your .env file"
    echo -e "  4. Run this script again"
    exit 1
fi

# Phala deployment
echo -e "${GREEN}Deploying to Phala Network...${NC}"
echo -e "${YELLOW}Running: npx phala cvms create --name defi-space-agents --compose phala/docker-compose.yml --env-file .env${NC}"

# Deploy the CVM with all environment variables from .env, accepting default values
echo -e "${GREEN}Creating Phala CVM with environment variables from .env...${NC}"
if ! yes "" | npx phala cvms create --name defi-space-agents --compose phala/docker-compose.yml --env-file .env; then
    echo -e "${RED}Deployment failed. Please check the above logs for details.${NC}"
    exit 1
fi

echo -e "${GREEN}Deployment initiated. Please check Phala Dashboard for status.${NC}"
echo -e "${YELLOW}Note: It may take a few minutes for your CVM to be fully provisioned.${NC}"
echo -e "${YELLOW}You can check the status with: npx phala cvms status${NC}"
echo -e "${GREEN}Phala deployment process complete!${NC}"
echo -e "${YELLOW}Visit the Phala Cloud Dashboard to monitor your deployment: https://cloud.phala.network/dashboard${NC}" 