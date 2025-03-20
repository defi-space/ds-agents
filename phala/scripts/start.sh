#!/bin/bash
set -e

echo "Starting DeFi Space Agents..."

# Function for quick service connectivity check
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

# Set up database hostnames with defaults
CHROMA_HOST=${CHROMA_HOST:-defi-space-agents_chroma}
CHROMA_PORT=${CHROMA_PORT:-8000}
MONGO_URI=${MONGO_URI:-mongodb://defi-space-agents_mongo:27017/daydreams}
MONGO_HOST=$(echo $MONGO_URI | sed -E "s|^mongodb://([^:/]+).*$|\\1|")
MONGO_PORT=$(echo $MONGO_URI | sed -E "s|^mongodb://[^:]+:([0-9]+).*$|\\1|")

echo "Configuration:"
echo "- Environment: ${NODE_ENV:-development}"
echo "- ChromaDB: $CHROMA_HOST:$CHROMA_PORT"
echo "- MongoDB: $MONGO_HOST:$MONGO_PORT"

# Check services are reachable
check_service $MONGO_HOST $MONGO_PORT "MongoDB" || echo "Warning: MongoDB check failed, will retry during startup"
check_service $CHROMA_HOST $CHROMA_PORT "ChromaDB" || echo "Warning: ChromaDB check failed, will retry during startup"

echo "Starting agents..."
exec bun run start-all 