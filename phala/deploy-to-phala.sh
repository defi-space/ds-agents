#!/bin/bash
# Script to deploy DeFi Space Agents to Phala Network
# Handles the Phala-specific deployment steps after image is built

set -e

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values for CVM creation
CVM_NAME="defi-space-agents"
CVM_VCPU="2"
CVM_MEMORY="4096"
CVM_DISK_SIZE="40"
CVM_TEEPOD_ID="3"
CVM_IMAGE="dstack-0.3.5"
PROCEED_DEPLOY="y"  # Default to yes for non-interactive mode

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --vcpu) CVM_VCPU="$2"; shift ;;
        --memory) CVM_MEMORY="$2"; shift ;;
        --disk-size) CVM_DISK_SIZE="$2"; shift ;;
        --teepod-id) CVM_TEEPOD_ID="$2"; shift ;;
        --image) CVM_IMAGE="$2"; shift ;;
        --name) CVM_NAME="$2"; shift ;;
        --proceed) PROCEED_DEPLOY="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo -e "${YELLOW}defi-space-agents - Phala TEE Deployment${NC}"
echo "=================================================="
echo -e "${GREEN}This script handles the Phala-specific deployment steps${NC}"
echo -e "${GREEN}Using configuration: vCPU=${CVM_VCPU}, Memory=${CVM_MEMORY}MB, Disk=${CVM_DISK_SIZE}GB${NC}"

# Navigate to project root (assuming script is in phala directory)
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

# Pre-process .env file (standardize API key format)
tmp_file=$(mktemp)
while IFS= read -r line; do
    if [[ $line =~ ^([A-Za-z0-9_]+_API_KEY)=(.*)$ ]]; then
        key_name="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"
        value=$(echo "$value" | sed -E 's/^["'"'"'](.*)['"'"'"]$/\1/')
        echo "$key_name=$value" >> "$tmp_file"
    else
        echo "$line" >> "$tmp_file"
    fi
done < .env
mv "$tmp_file" .env

# Verify environment variables
echo -e "${GREEN}Verifying environment variables...${NC}"
missing_vars=0
for var in AGENT1_PRIVATE_KEY AGENT1_ADDRESS AGENT1_API_KEY AGENT2_PRIVATE_KEY AGENT2_ADDRESS AGENT2_API_KEY AGENT3_PRIVATE_KEY AGENT3_ADDRESS AGENT3_API_KEY AGENT4_PRIVATE_KEY AGENT4_ADDRESS AGENT4_API_KEY STARKNET_RPC_URL INDEXER_URL GOOGLE_API_KEY; do
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

# Check if image reference exists in docker-compose.yml
if grep -q "YOUR_GITHUB_USERNAME" phala/docker-compose.yml; then
    echo -e "${YELLOW}Docker image not configured in docker-compose.yml.${NC}"
    echo -e "${YELLOW}Please run phala/build-image.sh first.${NC}"
    exit 1
fi

# Check if phala CLI is installed
if ! command -v phala &> /dev/null; then
    if command -v npx &> /dev/null; then
        echo -e "${YELLOW}Using Phala CLI via npx...${NC}"
        PHALA_CMD="npx phala"
    else
        echo -e "${RED}Node.js and NPX are required but not found. Please install Node.js first.${NC}"
        echo -e "${YELLOW}Visit https://nodejs.org/ for installation instructions.${NC}"
        exit 1
    fi
else
    PHALA_CMD="phala"
fi

# Check for PHALA_API_KEY in .env file first
phala_api_key=""
if grep -q "^PHALA_API_KEY=" .env; then
    # Extract the value properly, excluding any comments
    phala_api_key=$(grep "^PHALA_API_KEY=" .env | sed -E 's/^PHALA_API_KEY="?([^"#]*).*$/\1/' | tr -d "'" | tr -d ' ')
    
    # Check if it's empty after parsing
    if [ -z "$phala_api_key" ]; then
        echo -e "${YELLOW}Found PHALA_API_KEY in .env but value appears to be empty${NC}"
    fi
fi

# If not found in .env or empty, check environment variable
if [ -z "$phala_api_key" ] && [ ! -z "$PHALA_API_KEY" ]; then
    phala_api_key="$PHALA_API_KEY"
fi

# If still not found, error out - no prompt in non-interactive mode
if [ -z "$phala_api_key" ]; then
    echo -e "${RED}Phala Cloud API Key is required for deployment.${NC}"
    echo -e "${RED}Please add PHALA_API_KEY to your .env file or set it as an environment variable.${NC}"
    exit 1
fi

# Set the API key for this session
export PHALA_API_KEY="$phala_api_key"

# Log in with the Phala CLI
echo -e "${GREEN}Logging in to Phala Cloud...${NC}"

# Run login with error handling
if ! $PHALA_CMD auth login "$phala_api_key"; then
    echo -e "${RED}Authentication failed. Please check the following:${NC}"
    echo -e "  1. Your API key is correct and not expired"
    echo -e "  2. You are using the correct Phala Cloud environment"
    echo -e "  3. Your network connection is stable"
    echo -e "  4. The Phala Cloud service is available"
    exit 1
fi

# Phala deployment
echo -e "${GREEN}Deploying to Phala Network...${NC}"
echo -e "${YELLOW}Running: $PHALA_CMD cvms create with the following parameters:${NC}"
echo -e "${YELLOW}- Name: $CVM_NAME${NC}"
echo -e "${YELLOW}- vCPU: $CVM_VCPU${NC}"
echo -e "${YELLOW}- Memory: $CVM_MEMORY MB${NC}"
echo -e "${YELLOW}- Disk: $CVM_DISK_SIZE GB${NC}"

if [ "$PROCEED_DEPLOY" = "y" ]; then
    # Deploy the CVM with all environment variables from .env
    echo -e "${GREEN}Creating Phala CVM with environment variables from .env...${NC}"
    if ! $PHALA_CMD cvms create \
        --name "$CVM_NAME" \
        --compose phala/docker-compose.yml \
        --env-file .env \
        --vcpu "$CVM_VCPU" \
        --memory "$CVM_MEMORY" \
        --disk-size "$CVM_DISK_SIZE" \
        --teepod-id "$CVM_TEEPOD_ID" \
        --image "$CVM_IMAGE" \
        --skip-env; then
        echo -e "${RED}Deployment failed. Please check the above logs for details.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Deployment initiated. Please check Phala Dashboard for status.${NC}"
    echo -e "${YELLOW}Note: It may take a few minutes for your CVM to be fully provisioned.${NC}"
    echo -e "${YELLOW}You can check the status with: $PHALA_CMD cvms list${NC}"
else
    echo -e "${YELLOW}Deployment skipped (--proceed was not set to 'y').${NC}"
    echo -e "${YELLOW}You can run the command manually:${NC}"
    echo -e "${YELLOW}$PHALA_CMD cvms create --name $CVM_NAME --compose phala/docker-compose.yml --env-file .env --vcpu $CVM_VCPU --memory $CVM_MEMORY --disk-size $CVM_DISK_SIZE${NC}"
fi

echo -e "${GREEN}Phala deployment process complete!${NC}"
echo -e "${YELLOW}Visit the Phala Cloud Dashboard to monitor your deployment: https://cloud.phala.network/dashboard${NC}" 