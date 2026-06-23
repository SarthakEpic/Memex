#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Memex — Setup Script
# ═══════════════════════════════════════════════════════════════════════════
#
# This script sets up the Memex project on a new system.
# Run it after cloning the repository:
#
#   git clone https://github.com/YOUR_USERNAME/memex.git
#   cd memex
#   ./setup.sh
#
# It will:
#   1. Check prerequisites (Bun/Node)
#   2. Install all dependencies
#   3. Create the .env file from .env.example
#   4. Initialize the database
#   5. Verify the AI provider configuration
#   6. Start the dev server
#
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() { echo -e "${BLUE}ℹ${NC}  $1"; }
print_success() { echo -e "${GREEN}✓${NC}  $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_error() { echo -e "${RED}✗${NC}  $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "                    Memex — Setup Wizard"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Check prerequisites
# ─────────────────────────────────────────────────────────────────────────────
print_status "Checking prerequisites..."

# Check for Bun (preferred) or Node.js
if command -v bun &> /dev/null; then
  BUN_VERSION=$(bun --version)
  print_success "Bun $BUN_VERSION found"
  PM="bun"
elif command -v npm &> /dev/null; then
  NODE_VERSION=$(node --version)
  print_warning "Bun not found, using Node.js $NODE_VERSION + npm"
  print_warning "  (Bun is recommended for better performance: https://bun.sh)"
  PM="npm"
else
  print_error "Neither Bun nor Node.js found!"
  echo ""
  echo "Please install one of:"
  echo "  • Bun:  https://bun.sh"
  echo "  • Node: https://nodejs.org"
  exit 1
fi

# Check for git
if command -v git &> /dev/null; then
  print_success "Git found"
else
  print_warning "Git not found (optional, but recommended)"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Install dependencies
# ─────────────────────────────────────────────────────────────────────────────
print_status "Installing dependencies (this may take a minute)..."

if [ "$PM" = "bun" ]; then
  bun install
else
  npm install
fi

print_success "Dependencies installed"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Create .env file
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  print_status "Creating .env file from template..."
  cp .env.example .env
  print_success ".env file created"
  echo ""
  print_warning "IMPORTANT: You need to edit .env and add your AI provider API key!"
  echo ""
  echo "  Recommended (free): Google Gemini"
  echo "    1. Get a key at: https://aistudio.google.com/app/apikey"
  echo "    2. Edit .env and set:"
  echo "       AI_PROVIDER=gemini"
  echo "       GEMINI_API_KEY=your-key-here"
  echo ""
  echo "  Other options: Groq, OpenAI, Ollama (see README.md)"
  echo ""
  read -p "  Have you edited .env with your API key? (y/n): " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "You can edit .env later, but AI features won't work until you do."
    print_warning "The app will still run — go to Settings to see the provider status."
  fi
else
  print_success ".env file already exists"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Initialize the database
# ─────────────────────────────────────────────────────────────────────────────
print_status "Initializing database..."

if [ "$PM" = "bun" ]; then
  bun run db:push
else
  npm run db:push
fi

print_success "Database initialized"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Run lint check
# ─────────────────────────────────────────────────────────────────────────────
print_status "Running code quality check..."

if [ "$PM" = "bun" ]; then
  if bun run lint 2>&1 | tail -1 | grep -q "error" || [ $? -ne 0 ]; then
    print_warning "Some lint issues found (non-blocking)"
  else
    print_success "Code quality check passed"
  fi
else
  npm run lint 2>/dev/null || print_warning "Some lint issues found (non-blocking)"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Done — start the dev server
# ─────────────────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════════════════"
echo -e "                    ${GREEN}Setup Complete! 🎉${NC}"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "  To start the development server:"
echo ""
if [ "$PM" = "bun" ]; then
  echo "    bun run dev"
else
  echo "    npm run dev"
fi
echo ""
echo "  Then open: http://localhost:3000"
echo ""
echo "  Useful commands:"
echo "    bun run lint       # check code quality"
echo "    bun run db:push    # update database schema"
echo "    bun run db:use-postgres  # switch to PostgreSQL"
echo "    bun run db:use-sqlite    # switch back to SQLite"
echo ""
echo "  Need help? See README.md or go to Settings → AI Provider in the app."
echo ""
