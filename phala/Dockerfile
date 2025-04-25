FROM node:23-slim

# Install minimal required tools
RUN apt-get update && \
    apt-get install -y \
    netcat-openbsd \
    python3 \
    build-essential \
    unzip \
    curl \
    iproute2 \
    procps && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY vendored ./vendored

# Install Bun globally with proper permissions
ENV BUN_INSTALL="/usr/local"
RUN curl -fsSL https://bun.sh/install | bash && \
    chmod -R 755 /usr/local/bin/bun

# Install dependencies with bun which supports workspace protocol
RUN bun install

# Copy application code
COPY tsconfig.json contracts.json ./
COPY src ./src

# Copy startup script
COPY phala/scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Create a non-root user to run the application
RUN groupadd -r agent && useradd -r -g agent agent && \
    chown -R agent:agent /app

# Switch to non-root user
USER agent

# Set environment variables for the Phala TEE
ENV NODE_ENV=production \
    PHALA_TEE=true \
    PATH="/usr/local/bin:${PATH}"

# Run the application
CMD ["/bin/bash", "/app/start.sh"] 