#!/bin/bash
# Setup script for running Nexus evaluation locally
# Source this: source evals/setup.sh

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧪 Setting up Nexus Researcher Evaluation Environment"
echo "=================================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js 18+"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "❌ curl not found"
    exit 1
fi

echo "✅ npm version: $(npm --version)"
echo "✅ node version: $(node --version)"
echo ""

# Check if backend is running
echo "🔍 Checking backend availability..."
if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "✅ Backend API is running at http://localhost:8000"
else
    echo "⚠️  Backend API not ready. Starting Docker containers..."
    cd "$PROJECT_ROOT"
    docker compose up -d backend
    
    # Wait for backend
    echo "⏳ Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
            echo "✅ Backend is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "❌ Backend failed to start"
            exit 1
        fi
        sleep 2
    done
fi

echo ""

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd "$PROJECT_ROOT/frontend"
if [ ! -d "node_modules" ]; then
    npm ci
else
    echo "✅ Dependencies already installed"
fi

echo ""

# Set up environment
echo "🔐 Setting up environment variables..."
export NEXUS_EVAL_API="http://localhost:8000"
export NEXUS_EVAL_API_KEY="${API_KEY:-dev-key-for-eval}"
export NODE_ENV="test"

echo "  NEXUS_EVAL_API=$NEXUS_EVAL_API"
echo "  NODE_ENV=$NODE_ENV"
echo ""

# Ready to run
echo "✅ Setup complete!"
echo ""
echo "📊 To run evaluation:"
echo "  cd frontend"
echo "  npm run eval"
echo ""
echo "📈 To view results:"
echo "  npm run eval:view"
echo ""
