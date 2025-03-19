# Phala TEE Deployment Scripts

This directory contains all the necessary files and scripts to deploy the DeFi Space Agents to Phala Network's Trusted Execution Environment (TEE).

## Directory Contents

- `Dockerfile` - Container definition optimized for Phala TEE
- `phala-config.json` - Phala deployment configuration
- `build-image.sh` - Script to build and push Docker images to GitHub Container Registry
- `deploy-to-phala.sh` - Script to deploy the built image to Phala Network
- `README.md` - This file

## Deployment Process

The deployment to Phala has been split into two main steps:

### Step 1: Build and Push Docker Image

The first step is to build the Docker image and push it to GitHub Container Registry:

```bash
# Make the script executable
chmod +x phala-deploy/build-image.sh

# Run the build script
./phala-deploy/build-image.sh
```

This script will:
1. Build the Docker image using the Phala-optimized Dockerfile
2. Tag the image for GitHub Container Registry
3. Push the image to your GitHub Container Registry
4. Update the `phala-config.json` file with your image reference
5. Guide you through making the image public if needed

### Step 2: Deploy to Phala Network

After the image is built and pushed, deploy it to Phala Network:

```bash
# Make the script executable
chmod +x phala-deploy/deploy-to-phala.sh

# Run the deployment script
./phala-deploy/deploy-to-phala.sh
```

This script will:
1. Verify your environment configuration
2. Update your `.env` file with Phala-specific variables
3. Validate that the Docker image has been properly configured
4. Deploy your application to Phala Network
5. Provide instructions for monitoring the deployment

## Requirements

- Docker installed and configured
- GitHub account for Container Registry
- GitHub Personal Access Token with appropriate permissions
- Phala CLI installed (`npm install -g @phala/cli`)
- Phala Network account and Worker ID

## Security Considerations

- The `.env` file is never included in the Docker image
- Sensitive environment variables are passed securely at deployment time
- When running in Phala's TEE, your data is protected by the secure enclave
- Private keys are only accessible within the TEE environment

## Troubleshooting

If you encounter issues during deployment:

1. **Docker build fails**:
   - Check your Dockerfile for errors
   - Ensure you have permission to push to GitHub Container Registry

2. **Phala deployment fails**:
   - Verify your Phala CLI installation
   - Check that your image is public or properly authenticated
   - Ensure all required environment variables are set

3. **Runtime errors**:
   - Check Phala dashboard for logs
   - Verify that your image configuration matches what's expected by the application

## Further Resources

- [Phala Network Documentation](https://docs.phala.network/)
- [GitHub Container Registry Documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Documentation](https://docs.docker.com/) 