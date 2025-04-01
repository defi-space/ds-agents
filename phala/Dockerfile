FROM node:23-slim

# Install minimal required tools
RUN apt-get update && \
    apt-get install -y \
    netcat-openbsd \
    python3 \
    build-essential \
    unzip \
    curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
COPY vendored ./vendored

# Install dependencies with bun which supports workspace protocol
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
    AGENT_COUNT=4 \
    PHALA_TEE=true

# Run the application
CMD ["/bin/bash", "/app/start.sh"] 