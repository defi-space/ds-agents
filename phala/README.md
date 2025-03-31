# Phala TEE Deployment Scripts

This directory contains all the necessary files and scripts to deploy the DeFi Space Agents to Phala Network's Trusted Execution Environment (TEE).

## Directory Contents

- `Dockerfile` - Container definition optimized for Phala TEE
- `docker-compose.yml` - Docker Compose configuration for Phala Cloud deployment
- `scripts/` - Startup and monitoring scripts for the container
- `build-image.sh` - Script to build and push Docker images to GitHub Container Registry
- `deploy-to-phala.sh` - Script to deploy the built image to Phala Network
- `README.md` - This file
- `ENVIRONMENT_VARIABLES.md` - Important documentation on environment variable formatting

## Environment Variables

⚠️ **Important**: When setting API keys and other environment variables for Phala deployment, make sure to follow the guidelines in [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md). For optimal deployment, avoid adding surrounding quotes to your API keys, although the system will handle them automatically if present.

## Deployment Process

The deployment to Phala has been split into two main steps:

### Step 1: Build and Push Docker Image

The first step is to build the Docker image and push it to GitHub Container Registry:

```bash
# Make the script executable
chmod +x phala/build-image.sh

# Run the build script
./phala/build-image.sh
```

This script will:
1. Build the Docker image using the Phala-optimized Dockerfile
2. Tag the image for GitHub Container Registry
3. Push the image to your GitHub Container Registry
4. Update the `docker-compose.yml` file with your image reference
5. Guide you through making the image public if needed

### Step 2: Deploy to Phala Cloud

After the image is built and pushed, deploy it to Phala Cloud:

```bash
# Make the script executable
chmod +x phala/deploy-to-phala.sh

# Run the deployment script
./phala/deploy-to-phala.sh
```

This script will:
1. Verify your environment configuration
2. Check for quoted API keys and offer to fix them automatically
3. Update your `.env` file with Phala-specific variables
4. Validate that the Docker image has been properly configured
5. Ask for your Phala Cloud API key
6. Deploy your application to Phala Cloud using the latest CLI
7. Provide a link to monitor your deployment

## API Key Handling

The system includes robust API key handling at all levels:

- **Automatic quote removal**: The application automatically strips quotes from API keys at runtime
- **Deployment assistance**: The deployment script can automatically fix quoted keys in your `.env` file
- **Consistent behavior**: The system works properly regardless of whether quotes are present

## Container Architecture

The Docker container has been optimized for security and reliability:

### Improved Startup Process

The startup process has been streamlined with:

- **Service health detection**: Automatically detects when dependant services are ready
- **Simplified script**: Cleaner, more maintainable startup script
- **Error handling**: Better detection and reporting of configuration issues
- **Reduced waiting time**: Only waits as long as necessary before starting

### Containerization Benefits

Running in a containerized TEE environment provides:

- **Isolation**: Each service runs in its own isolated environment
- **Resource management**: Precise control over CPU and memory allocation
- **Consistent environment**: Same behavior in development and production
- **Security**: Sensitive information is protected within the TEE

## Requirements

- Docker installed and configured
- GitHub account for Container Registry
- GitHub Personal Access Token with appropriate permissions
- Node.js and NPX (to run the Phala CLI)
- Phala Cloud account and API Key

## Getting a Phala Cloud API Key

1. Create an account at [Phala Cloud](https://cloud.phala.network)
2. Click on your username in the top-left corner
3. Select "API Tokens"
4. Click "Create Token" to generate a new API key
5. Copy this key for use in the deployment script

## Security Considerations

- The `.env` file is never included in the Docker image
- Sensitive environment variables are passed securely at deployment time
- When running in Phala's TEE, your data is protected by the secure enclave
- Private keys are only accessible within the TEE environment
- The startup script has been optimized to avoid logging sensitive information

## Troubleshooting

If you encounter issues during deployment:

1. **Docker build fails**:
   - Check your Dockerfile for errors
   - Ensure you have permission to push to GitHub Container Registry

2. **Phala deployment fails**:
   - Verify you have a valid Phala Cloud API key
   - Check that your image is public or properly authenticated
   - Ensure all required environment variables are set

3. **API key issues**:
   - Verify your API keys don't contain any extra whitespace
   - The system automatically removes surrounding quotes if present
   - Check that your API keys have the correct permissions for Gemini API

## Further Resources

- [Phala Cloud Documentation](https://docs.phala.network/phala-cloud/getting-started/start-from-cloud-cli)
- [Create CVM with Docker Compose](https://docs.phala.network/phala-cloud/create-cvm/create-with-docker-compose)
- [Expose Service Ports in Phala](https://docs.phala.network/phala-cloud/migration/expose-service-port)
- [GitHub Container Registry Documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Documentation](https://docs.docker.com/) 