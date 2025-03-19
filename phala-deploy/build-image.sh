#!/bin/bash
# Script to build and push Docker images for Phala TEE deployment

set -e

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}defi-space-agents - Docker Image Builder${NC}"
echo "=================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker not found. Please install Docker first.${NC}"
    exit 1
fi

# Navigate to project root (assuming script is in phala-deploy directory)
cd "$(dirname "$0")/.."

# Ask for GitHub username
read -p "Enter your GitHub username: " github_username

if [ -z "$github_username" ]; then
    echo -e "${RED}GitHub username is required for GitHub Container Registry.${NC}"
    exit 1
fi

# Build Docker image
echo -e "${GREEN}Building Docker image using Phala TEE Dockerfile...${NC}"
docker build -t defi-space-agents -f phala-deploy/Dockerfile .

# Check if user is logged in to GHCR
if ! docker info | grep -q "ghcr.io"; then
    echo -e "${YELLOW}You don't appear to be logged in to GitHub Container Registry.${NC}"
    echo -e "${YELLOW}Please run: docker login ghcr.io -u ${github_username} -p YOUR_GITHUB_PAT${NC}"
    read -p "Have you logged in to GHCR? (y/n): " is_logged_in
    
    if [ "$is_logged_in" != "y" ]; then
        echo -e "${RED}Please log in to GitHub Container Registry before continuing.${NC}"
        exit 1
    fi
fi

# Tag and push image to GHCR
registry_image="ghcr.io/${github_username}/defi-space-agents:latest"
echo -e "${GREEN}Tagging image as ${registry_image}${NC}"
docker tag defi-space-agents "${registry_image}"

echo -e "${GREEN}Pushing image to GitHub Container Registry...${NC}"
docker push "${registry_image}"

# Update phala-config.json with the registry image
echo -e "${GREEN}Updating Phala configuration with GHCR image...${NC}"
sed -i "s|\"image\": \"ghcr.io/YOUR_GITHUB_USERNAME/defi-space-agents:latest\"|\"image\": \"${registry_image}\"|g" phala-deploy/phala-config.json
    
echo -e "${YELLOW}Using GitHub Container Registry image: ${registry_image}${NC}"

# Make the image public if the user wants to
read -p "Do you want to make your container image public? (y/n): " make_public
if [ "$make_public" = "y" ]; then
    echo -e "${YELLOW}Please go to: https://github.com/users/${github_username}/packages${NC}"
    echo -e "${YELLOW}Find defi-space-agents package, go to Package Settings and change visibility to public.${NC}"
fi

echo -e "${GREEN}Docker image built and pushed successfully!${NC}"
echo -e "${GREEN}You can now proceed with Phala deployment using deploy-to-phala.sh${NC}" 