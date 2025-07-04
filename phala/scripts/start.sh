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

# Display system and Node.js information
echo "=== System Information ==="
echo "- Node.js Version: $(node -v)"
echo -n "- Bun Version: "
if command -v bun &>/dev/null; then
  bun -v
else
  echo "Not found"
fi
echo "- OS: $(uname -a)"
echo -n "- Memory: "
if command -v free &>/dev/null; then
  free -h | grep Mem | awk '{print $2}'
else
  echo "Unknown (free command not available)"
fi
echo "=========================="

# Set up database hostnames with defaults
CHROMA_HOST=${CHROMA_HOST:-defi-space-agents_chroma}
CHROMA_PORT=${CHROMA_PORT:-8000}

echo "Configuration:"
echo "- Environment: ${NODE_ENV:-development}"
echo "- ChromaDB: $CHROMA_HOST:$CHROMA_PORT"

# Check for Firebase configuration
if [ -z "$FB_PROJECT_ID" ] || [ -z "$FB_CLIENT_EMAIL" ] || [ -z "$FB_PRIVATE_KEY" ]; then
  echo "⚠️ WARNING: Firebase configuration is missing. Make sure FB_PROJECT_ID, FB_CLIENT_EMAIL, and FB_PRIVATE_KEY are set."
else
  echo "- Database: Firebase ($FB_PROJECT_ID)"
fi

# Network diagnostics
echo "Network diagnostics:"
if command -v ip &>/dev/null; then
  ip addr | grep -E "inet\s" || echo "No IP addresses found"
  echo "Network routes:"
  ip route || echo "No routes found"
else
  echo "IP command not available. Network information cannot be displayed."
fi

# Check ChromaDB is reachable
check_service $CHROMA_HOST $CHROMA_PORT "ChromaDB" || echo "Warning: ChromaDB check failed, will retry during startup"

# Log Node.js options
echo "NODE_OPTIONS: ${NODE_OPTIONS}"

echo "Starting agents with Node.js $(node -v)..."
if command -v bun &>/dev/null; then
  echo "Using Bun to start agents"
  exec bun run start-all
else
  echo "Bun not found, falling back to Node.js"
  # Check if the script exists in package.json
  if grep -q "\"start-all\":" package.json; then
    echo "Using npm to start agents"
    exec npm run start-all
  else
    echo "Error: Neither Bun nor a compatible npm script was found. Cannot start agents."
    echo "Package.json contents:"
    cat package.json
    exit 1
  fi
fi 