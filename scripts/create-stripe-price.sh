#!/bin/bash

# Stripe Price Creation Script
# Creates new Professional plan price: $29/month

set -e

echo "================================================"
echo "  Stripe Price Update Script"
echo "  Armenian Market Pricing"
echo "================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo -e "${RED}❌ Stripe CLI not found!${NC}"
    echo ""
    echo -e "${YELLOW}Please install Stripe CLI first:${NC}"
    echo "  macOS: brew install stripe/stripe-cli/stripe"
    echo "  Linux: https://stripe.com/docs/stripe-cli#install"
    echo "  Then run: stripe login"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Stripe CLI found${NC}"
echo ""

# Get product list
echo -e "${YELLOW}Fetching Stripe products...${NC}"
echo ""

stripe products list --limit 10

echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${YELLOW}Find your Professional product ID above${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

read -p "Enter your Professional Product ID (prod_...): " PRODUCT_ID

if [[ ! $PRODUCT_ID =~ ^prod_ ]]; then
    echo -e "${RED}Invalid product ID. Must start with 'prod_'${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Creating new price: \$29/month for product ${PRODUCT_ID}...${NC}"
echo ""

# Create the new price
PRICE_OUTPUT=$(stripe prices create \
  --unit-amount 2900 \
  --currency usd \
  --recurring[interval]=month \
  --product "$PRODUCT_ID" \
  --lookup-key "professional_monthly_v2" \
  --nickname "Professional Plan - Armenian Market" \
  2>&1)

echo "$PRICE_OUTPUT"
echo ""

# Extract price ID
PRICE_ID=$(echo "$PRICE_OUTPUT" | grep -o 'price_[a-zA-Z0-9]*' | head -1)

if [[ -n $PRICE_ID ]]; then
    echo -e "${GREEN}✓ Successfully created new price!${NC}"
    echo ""
    echo -e "${CYAN}================================================${NC}"
    echo -e "${GREEN}New Price ID: ${PRICE_ID}${NC}"
    echo -e "${CYAN}================================================${NC}"
    echo ""
    echo -e "${YELLOW}Update your .env.local file:${NC}"
    echo ""
    echo "STRIPE_PRICE_PROFESSIONAL=${PRICE_ID}"
    echo ""
    echo -e "${CYAN}================================================${NC}"
else
    echo -e "${RED}❌ Failed to create price${NC}"
    exit 1
fi
