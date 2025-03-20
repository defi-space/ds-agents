FROM oven/bun:1 AS base

# Install netcat and network diagnostic tools
RUN apt-get update && \
    apt-get install -y \
    netcat-openbsd \
    iproute2 \
    net-tools \
    bash && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lock* ./
COPY vendored ./vendored

# Install dependencies with optimized caching
RUN bun install

# Copy application code
COPY tsconfig.json contracts.json ./
COPY src ./src

# Copy startup script
COPY phala/scripts/start.sh /app/start.sh

# Create a non-root user to run the application
RUN groupadd -r agent && useradd -r -g agent agent && \
    chown -R agent:agent /app

# Switch to non-root user
USER agent

# Set environment variables for the Phala TEE
ENV NODE_ENV=production \
    ENABLE_DASHBOARD=false \
    AGENT_COUNT=4 \
    PHALA_TEE=true

# Run the application
CMD ["/bin/bash", "/app/start.sh"] 