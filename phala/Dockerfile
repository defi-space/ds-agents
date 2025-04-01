FROM node:23-slim

# Install minimal required tools
RUN apt-get update && \
    apt-get install -y \
    netcat-openbsd \
    python3 \
    build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock* ./
COPY vendored ./vendored
RUN npm ci --only=production && npm rebuild

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production \
    AGENT_COUNT=4 \
    PHALA_TEE=true

# Run the application
CMD ["/bin/bash", "/app/phala/scripts/start.sh"] 