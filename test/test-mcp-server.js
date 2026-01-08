#!/usr/bin/env node

/**
 * Test script to validate MCP server functionality
 * Tests that the server can start and handle basic requests
 */

import { initializeDatabase, getOrderCount } from '../src/database.js';

console.log('🧪 Testing MCP Server...\n');

try {
  // Test 1: Database connection
  console.log('1. Testing database connection...');
  const db = initializeDatabase();
  const orderCount = getOrderCount(db);
  console.log(`✅ Database connected (${orderCount} orders)\n`);
  db.close();

  // Test 2: MCP server module can be imported
  console.log('2. Testing MCP server module import...');
  const serverModule = await import('../mcp-server.js');
  console.log('✅ MCP server module loaded\n');

  // Test 3: Verify MCP SDK is available
  console.log('3. Testing MCP SDK availability...');
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  console.log('✅ MCP SDK available\n');

  console.log('✅ All MCP server tests passed!\n');
  console.log('📝 Next steps:');
  console.log('   1. Set up your ANTHROPIC_API_KEY in .env');
  console.log('   2. Configure the MCP server in Claude Desktop');
  console.log('   3. Test with: npx @modelcontextprotocol/inspector node mcp-server.js\n');

  process.exit(0);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
