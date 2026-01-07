/**
 * Utility functions for logging and formatting
 */

import chalk from 'chalk';

/**
 * Log with color based on level
 */
export function log(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString();

  switch (level) {
    case 'success':
      console.log(chalk.green('✅'), message);
      break;
    case 'error':
      console.log(chalk.red('❌'), message);
      break;
    case 'warning':
      console.log(chalk.yellow('⚠️ '), message);
      break;
    case 'info':
      console.log(chalk.blue('ℹ️ '), message);
      break;
    default:
      console.log(message);
  }
}

/**
 * Format shopping list for terminal display
 */
export function formatShoppingList(recommendations) {
  if (!recommendations || recommendations.length === 0) {
    return chalk.yellow('No items recommended for this period.');
  }

  // Group by classification
  const regular = recommendations.filter(r => r.classification === 'regular');
  const infrequent = recommendations.filter(r => r.classification === 'infrequent');

  let output = '\n';
  output += chalk.bold.cyan('📋 Shopping List Generated\n');
  output += chalk.gray('═'.repeat(60)) + '\n\n';

  // Regular items
  if (regular.length > 0) {
    output += chalk.bold.green('🔄 REGULAR ITEMS\n');
    output += chalk.gray('Items you buy frequently\n\n');

    regular.forEach(item => {
      const confidence = Math.round(item.confidence * 100);
      const confidenceBar = '█'.repeat(Math.floor(confidence / 10));
      const confidenceColor = confidence >= 70 ? chalk.green : confidence >= 50 ? chalk.yellow : chalk.red;

      output += chalk.bold(`  • ${item.item}`);
      output += chalk.gray(` (${item.quantity}x)\n`);
      output += `    ${chalk.gray('Confidence:')} ${confidenceColor(confidenceBar)} ${confidence}%\n`;
      output += `    ${chalk.gray(item.reason)}\n\n`;
    });
  }

  // Infrequent items
  if (infrequent.length > 0) {
    output += chalk.bold.yellow('⏱️  INFREQUENT ITEMS\n');
    output += chalk.gray('Items you buy occasionally\n\n');

    infrequent.forEach(item => {
      const confidence = Math.round(item.confidence * 100);
      const confidenceBar = '█'.repeat(Math.floor(confidence / 10));
      const confidenceColor = confidence >= 70 ? chalk.green : confidence >= 50 ? chalk.yellow : chalk.red;

      output += chalk.bold(`  • ${item.item}`);
      output += chalk.gray(` (${item.quantity}x)\n`);
      output += `    ${chalk.gray('Confidence:')} ${confidenceColor(confidenceBar)} ${confidence}%\n`;
      output += `    ${chalk.gray(item.reason)}\n\n`;
    });
  }

  output += chalk.gray('═'.repeat(60)) + '\n';
  output += chalk.gray(`Total items: ${recommendations.length}\n`);

  return output;
}

/**
 * Format item list as simple text (for copy-paste)
 */
export function formatSimpleList(recommendations) {
  if (!recommendations || recommendations.length === 0) {
    return 'No items';
  }

  return recommendations
    .map(item => `${item.quantity}x ${item.item}`)
    .join('\n');
}

/**
 * Display error message with helpful context
 */
export function displayError(error, context = '') {
  console.log('\n' + chalk.red.bold('❌ Error: ') + chalk.red(error.message));

  if (context) {
    console.log(chalk.gray(context));
  }

  // Provide helpful hints based on error type
  if (error.message.includes('ANTHROPIC_API_KEY')) {
    console.log(chalk.yellow('\n💡 Tip: Make sure you have set ANTHROPIC_API_KEY in your .env file'));
    console.log(chalk.gray('   Get your API key from: https://console.anthropic.com/'));
  }

  if (error.message.includes('Rate limit')) {
    console.log(chalk.yellow('\n💡 Tip: You\'ve hit the API rate limit. Wait a minute and try again.'));
  }

  if (error.message.includes('database') || error.message.includes('SQLITE')) {
    console.log(chalk.yellow('\n💡 Tip: Database error. Try deleting data/shopping.db and running again.'));
  }

  console.log();
}

/**
 * Create progress indicator text
 */
export function progressText(current, total, message) {
  const percentage = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percentage / 5));
  const empty = '░'.repeat(20 - Math.floor(percentage / 5));

  return `${message} [${bar}${empty}] ${percentage}%`;
}

/**
 * Helper: Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper: Wait for user to press Enter
 */
export function waitForEnter() {
  return new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('', () => {
      readline.close();
      resolve();
    });
  });
}
