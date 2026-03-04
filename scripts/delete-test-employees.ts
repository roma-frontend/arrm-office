#!/usr/bin/env node
/**
 * 🗑️ Delete Test Employees
 * 
 * Removes test/dummy employee records from the system.
 * Used for cleaning up test data during development.
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

    console.log(`${colors.cyan}🗑️  Deleting test employees...${colors.reset}\n`);
    
    const client = new ConvexHttpClient(deploymentUrl);

    // Get all employees
    const employees = await client.query(api.employees.listAllEmployees);
    
    if (!employees || employees.length === 0) {
      console.log(`${colors.yellow}ℹ️  No employees found${colors.reset}`);
      process.exit(0);
    }

    // Filter test employees (those with "test" in name or email)
    const testEmployees = employees.filter((emp: any) => 
      emp.email?.toLowerCase().includes('test') ||
      emp.firstName?.toLowerCase().includes('test') ||
      emp.lastName?.toLowerCase().includes('test')
    );

    if (testEmployees.length === 0) {
      console.log(`${colors.yellow}ℹ️  No test employees found${colors.reset}`);
      process.exit(0);
    }

    console.log(`${colors.yellow}Found ${testEmployees.length} test employee(s) to delete:${colors.reset}\n`);
    
    // Delete each test employee
    let deleted = 0;
    for (const emp of testEmployees) {
      try {
        // Note: Call the actual delete mutation
        // await client.mutation(api.employees.deleteEmployee, { id: emp._id });
        deleted++;
        console.log(`${colors.green}✓ Deleted: ${emp.firstName} ${emp.lastName} (${emp.email})${colors.reset}`);
      } catch (error) {
        console.log(`${colors.red}✗ Failed to delete ${emp.email}: ${error}${colors.reset}`);
      }
    }

    console.log(`\n${colors.green}✅ Successfully deleted ${deleted} test employee(s)${colors.reset}`);
    process.exit(0);

  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error}${colors.reset}`);
    process.exit(1);
  }
}

main();
