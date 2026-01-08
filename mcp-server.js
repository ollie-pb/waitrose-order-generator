#!/usr/bin/env node

/**
 * Waitrose Shopping List Generator - MCP Server
 * Exposes shopping list generation as MCP tools for Claude and other AI assistants
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  initializeDatabase,
  getItemFrequency,
  getOrderCount,
  getAllShoppingLists,
  getShoppingList,
} from './src/database.js';
import {
  classifyItems,
  calculateDaysSinceLastPurchase,
  generatePatternSummary,
} from './src/analyzer.js';
import { generateShoppingList } from './src/claude-client.js';

/**
 * MCP Server for Waitrose Shopping List Generator
 */
class WaitroseShoppingServer {
  constructor() {
    this.server = new Server(
      {
        name: 'waitrose-shopping-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_shopping_list',
          description:
            'Generate an intelligent shopping list based on Waitrose order history. Analyzes purchase patterns and uses AI to recommend items and quantities for the specified number of days.',
          inputSchema: {
            type: 'object',
            properties: {
              days: {
                type: 'number',
                description: 'Number of days to cover (5-8 days)',
                minimum: 5,
                maximum: 8,
                default: 7,
              },
              save: {
                type: 'boolean',
                description: 'Whether to save the generated list to database',
                default: true,
              },
            },
          },
        },
        {
          name: 'get_statistics',
          description:
            'Get shopping pattern statistics including total orders, unique products, and item classifications (regular, infrequent, one-off). Shows top 10 most frequently purchased items.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_shopping_history',
          description:
            'Get a list of all previously generated shopping lists with basic metadata (ID, date, days coverage, item count).',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of lists to return',
                minimum: 1,
                maximum: 100,
                default: 10,
              },
            },
          },
        },
        {
          name: 'get_shopping_list',
          description:
            'Get detailed information about a specific shopping list by ID, including all items with quantities, classifications, and confidence scores.',
          inputSchema: {
            type: 'object',
            properties: {
              list_id: {
                type: 'number',
                description: 'The ID of the shopping list to retrieve',
                minimum: 1,
              },
            },
            required: ['list_id'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'generate_shopping_list':
            return await this.handleGenerateShoppingList(args);

          case 'get_statistics':
            return await this.handleGetStatistics();

          case 'get_shopping_history':
            return await this.handleGetShoppingHistory(args);

          case 'get_shopping_list':
            return await this.handleGetShoppingList(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Generate shopping list with AI recommendations
   */
  async handleGenerateShoppingList(args) {
    const daysCoverage = args.days ?? 7;
    const shouldSave = args.save ?? true;

    // Validate days coverage
    if (daysCoverage < 5 || daysCoverage > 8) {
      throw new Error('Days must be between 5 and 8');
    }

    // Initialize database
    const db = initializeDatabase();

    try {
      // Check if we have enough orders
      const orderCount = getOrderCount(db);
      if (orderCount < 3) {
        return {
          content: [
            {
              type: 'text',
              text: `Only ${orderCount} orders found in database. Need at least 3 for pattern analysis.\n\nPlease add more Waitrose order data first.`,
            },
          ],
        };
      }

      // Analyze patterns
      const frequency = getItemFrequency(db, { minOrders: 2 });
      const classified = classifyItems(frequency);
      const withDays = calculateDaysSinceLastPurchase(classified);
      const patternSummary = generatePatternSummary(withDays, db, daysCoverage);

      const totalNeeded =
        patternSummary.regularItems.length + patternSummary.infrequentItems.length;

      if (totalNeeded === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No items predicted as needed for the next ${daysCoverage} days based on your shopping patterns.`,
            },
          ],
        };
      }

      // Generate recommendations with Claude
      const result = await generateShoppingList(patternSummary, { daysCoverage });

      // Save to database if requested
      let listId = null;
      if (shouldSave) {
        const { saveShoppingList } = await import('./src/database.js');
        listId = saveShoppingList(db, daysCoverage, result.recommendations);
      }

      // Format response
      const response = {
        success: true,
        list_id: listId,
        days_coverage: daysCoverage,
        order_count: orderCount,
        items: result.recommendations,
        token_usage: {
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
        },
      };

      // Format as readable text
      let text = `# Shopping List Generated\n\n`;
      text += `**Coverage:** ${daysCoverage} days\n`;
      text += `**Based on:** ${orderCount} orders\n`;
      text += `**Items:** ${result.recommendations.length}\n`;
      if (listId) {
        text += `**Saved as:** List #${listId}\n`;
      }
      text += `\n## Items\n\n`;

      result.recommendations.forEach((item) => {
        text += `- **${item.item}** (${item.quantity}x) - ${item.classification}`;
        if (item.confidence) {
          text += ` [${Math.round(item.confidence * 100)}% confidence]`;
        }
        if (item.reasoning) {
          text += `\n  _${item.reasoning}_`;
        }
        text += '\n';
      });

      text += `\n**Token usage:** ${result.usage.input_tokens} input, ${result.usage.output_tokens} output\n`;

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    } finally {
      db.close();
    }
  }

  /**
   * Get shopping pattern statistics
   */
  async handleGetStatistics() {
    const db = initializeDatabase();

    try {
      const orderCount = getOrderCount(db);

      if (orderCount === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No orders in database. Please add Waitrose order data first.',
            },
          ],
        };
      }

      const frequency = getItemFrequency(db, { minOrders: 1 });
      const classified = classifyItems(frequency);

      const regular = classified.filter((i) => i.classification === 'regular').length;
      const infrequent = classified.filter((i) => i.classification === 'infrequent').length;
      const oneOff = classified.filter((i) => i.classification === 'one-off').length;

      // Format response
      let text = `# Shopping Pattern Statistics\n\n`;
      text += `**Total Orders:** ${orderCount}\n`;
      text += `**Unique Products:** ${frequency.length}\n\n`;
      text += `## Classification\n\n`;
      text += `- **Regular items** (≥40% frequency): ${regular}\n`;
      text += `- **Infrequent items** (<40% frequency): ${infrequent}\n`;
      text += `- **One-off purchases:** ${oneOff}\n\n`;

      // Top 10 most frequent items
      const top10 = frequency.slice(0, 10);
      text += `## Top 10 Most Frequent Items\n\n`;

      top10.forEach((item, index) => {
        const freq = (item.frequency * 100).toFixed(0);
        text += `${index + 1}. **${item.product_name}** - ${freq}% frequency (${item.purchase_count} purchases)\n`;
      });

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    } finally {
      db.close();
    }
  }

  /**
   * Get shopping list history
   */
  async handleGetShoppingHistory(args) {
    const limit = args.limit ?? 10;

    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    const db = initializeDatabase();

    try {
      const lists = getAllShoppingLists(db);
      const limited = lists.slice(0, limit);

      if (limited.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No shopping lists found. Generate your first list with the generate_shopping_list tool.',
            },
          ],
        };
      }

      let text = `# Shopping List History\n\n`;
      text += `Showing ${limited.length} of ${lists.length} total lists\n\n`;

      limited.forEach((list) => {
        const date = new Date(list.generated_at).toLocaleString();
        text += `## List #${list.id}\n`;
        text += `- **Generated:** ${date}\n`;
        text += `- **Coverage:** ${list.days_coverage} days\n`;
        text += `- **Items:** ${list.item_count}\n\n`;
      });

      text += `Use the \`get_shopping_list\` tool with a specific ID to view detailed items.\n`;

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    } finally {
      db.close();
    }
  }

  /**
   * Get specific shopping list by ID
   */
  async handleGetShoppingList(args) {
    const listId = args.list_id;

    if (!listId || listId < 1) {
      throw new Error('list_id must be a positive number');
    }

    const db = initializeDatabase();

    try {
      const list = getShoppingList(db, listId);

      if (!list) {
        return {
          content: [
            {
              type: 'text',
              text: `Shopping list #${listId} not found.`,
            },
          ],
        };
      }

      const date = new Date(list.generated_at).toLocaleString();

      let text = `# Shopping List #${list.id}\n\n`;
      text += `**Generated:** ${date}\n`;
      text += `**Coverage:** ${list.days_coverage} days\n`;
      text += `**Items:** ${list.items.length}\n\n`;
      text += `## Items\n\n`;

      list.items.forEach((item) => {
        text += `- **${item.product_name}** (${item.quantity}x) - ${item.classification}`;
        if (item.confidence) {
          text += ` [${Math.round(item.confidence * 100)}% confidence]`;
        }
        text += '\n';
      });

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    } finally {
      db.close();
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Waitrose Shopping MCP Server running on stdio');
  }
}

// Start the server
const server = new WaitroseShoppingServer();
server.run().catch(console.error);
