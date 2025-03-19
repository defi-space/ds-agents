FROM node:20-slim as base

# Install Bun
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY vendored ./vendored

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the application code
COPY tsconfig.json .
COPY contracts.json .
COPY src ./src

# Create a non-root user to run the application
RUN groupadd -r agent && useradd -r -g agent agent
RUN chown -R agent:agent /app
USER agent

# Set environment variables for the Phala TEE
ENV NODE_ENV=production
ENV ENABLE_DASHBOARD=false
ENV AGENT_COUNT=4
ENV PHALA_TEE=true

# Run all 4 agents for the TEE environment
CMD ["bun", "run", "start-all"] 