#!/usr/bin/env node

/**
 * Waitrose Shopping List Generator CLI
 * Generates intelligent shopping lists using Claude AI and order history analysis
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import {
  initializeDatabase,
  getItemFrequency,
  saveShoppingList,
  getOrderCount,
  getAllShoppingLists,
  getShoppingList,
  getLastSyncTime
} from './src/database.js';
import {
  classifyItems,
  calculateDaysSinceLastPurchase,
  generatePatternSummary
} from './src/analyzer.js';
import { generateShoppingList } from './src/claude-client.js';
import { log, formatShoppingList, formatSimpleList, displayError } from './src/utils.js';

const program = new Command();

/**
 * Validate numeric input to prevent injection and memory exhaustion attacks
 */
function validateNumericInput(value, paramName, min = 0, max = 1000) {
  const parsed = parseInt(value);

  if (isNaN(parsed)) {
    throw new Error(`${paramName} must be a valid number`);
  }

  if (parsed < min || parsed > max) {
    throw new Error(`${paramName} must be between ${min} and ${max}`);
  }

  return parsed;
}

program
  .name('waitrose-generate')
  .description('Generate intelligent shopping lists from Waitrose order history')
  .version('0.1.0');

/**
 * Main command: Generate shopping list
 */
program
  .command('generate', { isDefault: true })
  .description('Generate a shopping list based on order history')
  .option('-d, --days <number>', 'Number of days to cover (5-8)', '7')
  .option('--simple', 'Output simple text format instead of formatted')
  .option('--no-save', 'Don\'t save the generated list to database')
  .action(async (options) => {
    const spinner = ora();

    try {
      const daysCoverage = parseInt(options.days);
      if (daysCoverage < 5 || daysCoverage > 8) {
        throw new Error('Days must be between 5 and 8');
      }

      // Initialize database
      spinner.start('Loading database...');
      const db = initializeDatabase();
      spinner.succeed('Database loaded');

      // Check if we have enough orders
      const orderCount = getOrderCount(db);
      if (orderCount < 3) {
        spinner.warn(`Only ${orderCount} orders found. Need at least 3 for pattern analysis.`);
        console.log(chalk.yellow('\n💡 Run the scraper first to collect order history:\n'));
        console.log(chalk.gray('   waitrose-generate scrape\n'));
        db.close();
        return;
      }

      log(`Found ${orderCount} orders in database`, 'info');

      // Analyze patterns
      spinner.start('Analyzing shopping patterns...');
      const frequency = getItemFrequency(db, { minOrders: 2 });
      const classified = classifyItems(frequency);
      const withDays = calculateDaysSinceLastPurchase(classified);
      const patternSummary = generatePatternSummary(withDays, db, daysCoverage);
      spinner.succeed('Pattern analysis complete');

      const totalNeeded = patternSummary.regularItems.length + patternSummary.infrequentItems.length;

      if (totalNeeded === 0) {
        log('No items predicted as needed for the next ' + daysCoverage + ' days', 'warning');
        db.close();
        return;
      }

      log(`Found ${totalNeeded} items likely needed`, 'info');

      // Generate recommendations with Claude
      spinner.start('Generating recommendations with Claude AI...');
      const result = await generateShoppingList(patternSummary, { daysCoverage });
      spinner.succeed('Shopping list generated');

      log(`Used ${result.usage.input_tokens} input tokens, ${result.usage.output_tokens} output tokens`, 'info');

      // Display results
      if (options.simple) {
        console.log('\n' + formatSimpleList(result.recommendations));
      } else {
        console.log(formatShoppingList(result.recommendations));
      }

      // Save to database
      if (options.save) {
        spinner.start('Saving shopping list...');
        const listId = saveShoppingList(db, daysCoverage, result.recommendations);
        spinner.succeed(`Shopping list saved (ID: ${listId})`);
      }

      db.close();
    } catch (error) {
      spinner.fail('Failed to generate shopping list');
      displayError(error);
      process.exit(1);
    }
  });

/**
 * Command: Scrape Waitrose order history
 */
program
  .command('scrape')
  .description('Scrape order history from Waitrose.com using Claude in Chrome')
  .option('--limit <number>', 'Maximum number of orders to scrape', '50')
  .action(async (options) => {
    console.log(chalk.yellow('\n⚠️  Scraping functionality coming soon!\n'));
    console.log('This will use Claude in Chrome to navigate Waitrose and extract orders.');
    console.log('For now, you can test with the mock data in the database.\n');

    // TODO: Implement Claude in Chrome integration
    // This will be Phase 3b
  });

/**
 * Command: Detect new orders
 */
program
  .command('detect')
  .description('Check for new orders since last scrape (requires Claude Code)')
  .option('--auto-import', 'Automatically import new orders (not yet implemented)')
  .option('--max <number>', 'Maximum orders to check', '50')
  .action(async (options) => {
    try {
      const db = initializeDatabase();
      const lastSync = getLastSyncTime(db);
      const orderCount = getOrderCount(db);

      console.log(chalk.bold.cyan('\n🔍 Order Detection Status\n'));
      console.log(chalk.gray('═'.repeat(50)));
      console.log(`${chalk.bold('Last sync:')} ${lastSync.time || 'Never'}`);
      console.log(`${chalk.bold('Orders in database:')} ${orderCount}`);
      console.log(chalk.gray('═'.repeat(50)) + '\n');

      console.log(chalk.yellow('💡 Detection requires Claude Code integration\n'));
      console.log('To detect new orders:');
      console.log(chalk.gray('1. Open Claude Code (https://claude.com/code)'));
      console.log(chalk.gray('2. Ask: "Detect new Waitrose orders"'));
      console.log(chalk.gray('3. Claude will use Chrome automation to check for new orders\n'));

      console.log(chalk.dim('Note: This command shows status only.'));
      console.log(chalk.dim('Full detection requires Claude in Chrome MCP tools.\n'));

      db.close();
    } catch (error) {
      displayError(error);
      process.exit(1);
    }
  });

/**
 * Command: View shopping list history
 */
program
  .command('history')
  .description('View previously generated shopping lists')
  .option('-i, --id <number>', 'Show specific list by ID')
  .option('-l, --limit <number>', 'Number of recent lists to show', '10')
  .action(async (options) => {
    try {
      const db = initializeDatabase();

      if (options.id) {
        // Show specific list
        const listId = validateNumericInput(options.id, '--id', 1, 9999);
        const list = getShoppingList(db, listId);

        if (!list) {
          log(`List #${options.id} not found`, 'error');
          db.close();
          return;
        }

        console.log(chalk.bold.cyan(`\n📋 Shopping List #${list.id}\n`));
        console.log(chalk.gray(`Generated: ${list.generated_at}`));
        console.log(chalk.gray(`Coverage: ${list.days_coverage} days`));
        console.log(chalk.gray(`Items: ${list.items.length}\n`));

        list.items.forEach(item => {
          console.log(`  • ${item.product_name} (${item.quantity}x) - ${item.classification}`);
        });
        console.log();
      } else {
        // Show list of recent lists
        const limit = validateNumericInput(options.limit, '--limit', 1, 100);
        const lists = getAllShoppingLists(db);
        const limited = lists.slice(0, limit);

        if (limited.length === 0) {
          log('No shopping lists found', 'warning');
          db.close();
          return;
        }

        console.log(chalk.bold.cyan('\n📚 Shopping List History\n'));
        console.log('ID  | Generated           | Days | Items');
        console.log('─'.repeat(50));

        limited.forEach(list => {
          const id = list.id.toString().padEnd(3);
          const date = new Date(list.generated_at).toLocaleString();
          const days = list.days_coverage.toString().padEnd(4);
          const items = list.item_count;

          console.log(`${id} | ${date} | ${days} | ${items}`);
        });

        console.log(chalk.gray(`\nShowing ${limited.length} of ${lists.length} lists`));
        console.log(chalk.gray('Use --id <number> to view a specific list\n'));
      }

      db.close();
    } catch (error) {
      displayError(error);
      process.exit(1);
    }
  });

/**
 * Command: Show statistics
 */
program
  .command('stats')
  .description('Show shopping pattern statistics')
  .action(async () => {
    const spinner = ora('Loading statistics...').start();

    try {
      const db = initializeDatabase();
      const orderCount = getOrderCount(db);

      if (orderCount === 0) {
        spinner.warn('No orders in database');
        db.close();
        return;
      }

      const frequency = getItemFrequency(db, { minOrders: 1 });
      const classified = classifyItems(frequency);

      const regular = classified.filter(i => i.classification === 'regular').length;
      const infrequent = classified.filter(i => i.classification === 'infrequent').length;
      const oneOff = classified.filter(i => i.classification === 'one-off').length;

      spinner.succeed('Statistics loaded');

      console.log(chalk.bold.cyan('\n📊 Shopping Pattern Statistics\n'));
      console.log(chalk.gray('═'.repeat(40)));
      console.log(`${chalk.bold('Total Orders:')} ${orderCount}`);
      console.log(`${chalk.bold('Unique Products:')} ${frequency.length}`);
      console.log();
      console.log(chalk.green(`Regular items (≥40% frequency):`), regular);
      console.log(chalk.yellow(`Infrequent items (<40% frequency):`), infrequent);
      console.log(chalk.gray(`One-off purchases:`), oneOff);
      console.log(chalk.gray('═'.repeat(40)) + '\n');

      // Top 10 most frequent items
      const top10 = frequency.slice(0, 10);
      console.log(chalk.bold('Top 10 Most Frequent Items:\n'));
      console.log('Product Name                  | Frequency | Purchases');
      console.log('─'.repeat(60));

      top10.forEach((item, index) => {
        const name = item.product_name.padEnd(30);
        const freq = (item.frequency * 100).toFixed(0) + '%';
        const purchases = item.purchase_count;
        console.log(`${name}| ${freq.padEnd(9)} | ${purchases}`);
      });
      console.log();

      db.close();
    } catch (error) {
      spinner.fail('Failed to load statistics');
      displayError(error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
