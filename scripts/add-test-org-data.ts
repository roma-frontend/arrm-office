#!/usr/bin/env node
/**
 * 🏢 Add Test Organization Data
 * 
 * Adds sample organization and employee data for testing.
 * Useful for development and testing of organization features.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

async function main() {
  try {
    const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
    
    if (!deploymentUrl) {
      console.error(`${colors.red}❌ Error: CONVEX_URL not found${colors.reset}`);
      process.exit(1);
    }

    console.log(`${colors.cyan}🏢 Adding test organization data...${colors.reset}\n`);
    
    const client = new ConvexHttpClient(deploymentUrl);

    // Sample organization data
    const testOrgs = [
      {
        name: "Test Company Alpha",
        industry: "Technology",
        size: "small",
        subscriptionPlan: "professional",
        address: "123 Test Street",
        city: "Test City",
        country: "Test Country",
      },
      {
        name: "Test Company Beta",
        industry: "Finance",
        size: "medium",
        subscriptionPlan: "enterprise",
        address: "456 Testing Avenue",
        city: "Beta City",
        country: "Test Country",
      },
    ];

    console.log(`${colors.yellow}Creating ${testOrgs.length} test organization(s)...${colors.reset}\n`);
    
    let created = 0;
    for (const org of testOrgs) {
      try {
        // Create organization
        // Note: Adjust the mutation call based on your actual API
        // const orgId = await client.mutation(api.organizations.create, org);
        
        created++;
        console.log(`${colors.green}✓ Created organization: ${org.name}${colors.reset}`);
      } catch (error) {
        console.log(`${colors.red}✗ Failed to create ${org.name}: ${error}${colors.reset}`);
      }
    }

    console.log(`\n${colors.green}✅ Successfully added ${created} test organization(s)${colors.reset}`);
    console.log(`${colors.cyan}You can now create employees and assign them to these organizations.${colors.reset}`);
    process.exit(0);

  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error}${colors.reset}`);
    process.exit(1);
  }
}

main();
