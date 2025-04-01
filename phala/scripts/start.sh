#!/bin/bash
set -e

echo "Starting DeFi Space Agents..."

# Basic service check function
check_service() {
  local host=$1
  local port=$2
  local name=$3
  
  echo "Checking connection to $name at $host:$port..."
  if nc -z $host $port > /dev/null 2>&1; then
    echo "✓ $name is reachable"
    return 0
  else
    echo "✗ $name is not reachable at $host:$port"
    return 1
  fi
}

# Basic diagnostics
echo "Node.js Version: $(node -v)"

# Database settings
CHROMA_HOST=${CHROMA_HOST:-defi-space-agents_chroma}
CHROMA_PORT=${CHROMA_PORT:-8000}

echo "Configuration:"
echo "- Environment: ${NODE_ENV:-development}"
echo "- ChromaDB: $CHROMA_HOST:$CHROMA_PORT"

# Check ChromaDB
check_service $CHROMA_HOST $CHROMA_PORT "ChromaDB" || echo "Warning: ChromaDB check failed"

echo "Starting agents..."
exec npm run start-all 