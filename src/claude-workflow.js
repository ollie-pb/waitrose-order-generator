/**
 * Claude Code Workflow for Shopping List Generation + Basket Automation
 * This file is designed to be run directly by Claude Code with Chrome MCP tools
 */

import chalk from 'chalk';
import { generateShoppingListWithOptions } from './list-generator.js';
import { formatShoppingList } from './utils.js';
import { populateBasket } from './basket-automator.js';

/**
 * Generate shopping list and optionally add to Waitrose basket
 * This function is called directly by Claude Code with Chrome MCP tools available
 *
 * @param {Object} chromeTools - Chrome MCP tools provided by Claude Code
 * @param {Object} options - Generation options
 * @param {number} options.daysCoverage - Days to cover (default: 7)
 * @param {boolean} options.addToBasket - Automatically add to basket (default: false, ask user)
 * @returns {Promise<Object>} Results
 */
export async function generateAndOptionallyAutomate(chromeTools, options = {}) {
  const {
    daysCoverage = 7,
    addToBasket = null  // null = ask user, true = auto-add, false = skip
  } = options;

  console.log(chalk.bold.cyan('\n🛒 Waitrose Shopping List Generator\n'));
  console.log(chalk.gray('Analyzing your order history and generating recommendations...\n'));

  try {
    // Step 1: Generate shopping list
    const result = await generateShoppingListWithOptions({
      daysCoverage,
      save: true
    });

    const { recommendations, usage, listId, db, orderCount, totalNeeded } = result;

    // Log stats
    console.log(chalk.blue(`ℹ️  Found ${orderCount} orders in database`));
    console.log(chalk.blue(`ℹ️  Found ${totalNeeded} items likely needed`));
    console.log(chalk.gray(`ℹ️  Used ${usage.input_tokens} input tokens, ${usage.output_tokens} output tokens\n`));

    // Display the shopping list
    console.log(formatShoppingList(recommendations));

    if (listId) {
      console.log(chalk.green(`✔ Shopping list saved (ID: ${listId})\n`));
    }

    // Step 2: Handle basket automation
    let shouldAddToBasket = addToBasket;

    // If not specified, this would be where we'd ask the user
    // But since we can't easily do interactive prompts from Node.js called by Claude,
    // we'll return the results and let Claude handle the user interaction

    db.close();

    return {
      success: true,
      recommendations,
      listId,
      orderCount,
      totalNeeded,
      usage,
      // Return a function that Claude can call to add to basket
      addToBasket: async () => {
        if (!chromeTools) {
          throw new Error('Chrome MCP tools not available');
        }

        console.log(chalk.cyan('\n🛒 Starting basket automation...\n'));

        const basketResults = await populateBasket(
          chromeTools,
          recommendations,
          { listId }
        );

        // Display summary
        console.log(chalk.bold.green(`\n✓ Basket automation complete\n`));
        console.log(`  Added: ${basketResults.added.length}/${recommendations.length} items`);

        if (basketResults.failed.length > 0) {
          console.log(chalk.yellow(`  Failed: ${basketResults.failed.length} items`));
          basketResults.failed.forEach(item => {
            console.log(chalk.gray(`    • ${item.item} (${item.status})`));
          });
        }

        console.log(chalk.cyan('\n🌐 Review your basket and checkout when ready\n'));

        return basketResults;
      }
    };

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    throw error;
  }
}
