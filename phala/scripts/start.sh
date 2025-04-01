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

echo "Configuration:"
echo "- Environment: ${NODE_ENV:-development}"
echo "- ChromaDB: $CHROMA_HOST:$CHROMA_PORT"

# Check for MongoDB Atlas URI
if [ -z "$MONGODB_ATLAS_URI" ]; then
  echo "⚠️ WARNING: MongoDB Atlas URI is missing. Make sure MONGODB_ATLAS_URI is set."
else
  # Extract domain from URI for logging purposes only
  ATLAS_DOMAIN=$(echo $MONGODB_ATLAS_URI | sed -E 's|^mongodb\+srv://[^@]+@([^/]+).*$|\1|')
  echo "- Database: MongoDB Atlas ($ATLAS_DOMAIN)"
fi

# Check ChromaDB is reachable
check_service $CHROMA_HOST $CHROMA_PORT "ChromaDB" || echo "Warning: ChromaDB check failed, will retry during startup"

echo "Starting agents..."
exec bun run start-all 