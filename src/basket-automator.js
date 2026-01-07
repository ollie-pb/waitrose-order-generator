/**
 * Waitrose basket automation using Claude in Chrome MCP tools
 * Integrates with the generate command to automatically add items to basket
 */

import { sleep, waitForEnter } from './utils.js';

/**
 * Normalize product name for search
 * Removes size indicators, pack info, and extra words
 * "Waitrose Organic Milk Semi-Skimmed 2L" → "milk semi skimmed"
 */
function normalizeProductName(productName) {
  let normalized = productName.toLowerCase();

  // Remove common size/pack indicators
  normalized = normalized.replace(/\d+\s*(ml|l|g|kg|pack|pk|x)/gi, '');

  // Remove brand names (waitrose, essential, etc.)
  normalized = normalized.replace(/\b(waitrose|essential|duchy|own brand)\b/gi, '');

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Check if user is authenticated and prompt login if needed
 * Reuses pattern from chrome-scraper.js
 */
async function ensureAuthenticated(chromeTools, tabId) {
  await chromeTools.navigate({ tabId, url: 'https://www.waitrose.com' });

  const snapshot = await chromeTools.read_page({ tabId });

  if (snapshot.text.includes('Sign in') || snapshot.text.includes('Log in')) {
    console.log('\n🔐 Please log in to Waitrose in the browser window');
    console.log('Press Enter when logged in...\n');
    await waitForEnter();

    // Verify login succeeded
    const verifySnapshot = await chromeTools.read_page({ tabId });
    if (verifySnapshot.text.includes('Sign in')) {
      throw new Error('Login verification failed. Please try again.');
    }
  }

  return true;
}

/**
 * Add single item to basket
 * Uses first search result (trusts Waitrose search ranking)
 */
async function addItemToBasket(chromeTools, tabId, productName, quantity) {
  try {
    // 1. Normalize search term
    const searchTerm = normalizeProductName(productName);

    // 2. Find search box and search
    const searchBox = await chromeTools.find({ tabId, query: 'search input box' });

    if (searchBox.length === 0) {
      throw new Error('Search box not found');
    }

    await chromeTools.type({
      tabId,
      ref: searchBox[0].ref,
      element: 'search input',
      text: searchTerm,
      submit: true
    });

    // 3. Wait for results to load
    await sleep(2000); // Give search results time to load

    // 4. Find add to basket buttons
    const addButtons = await chromeTools.find({
      tabId,
      query: 'add to basket button'
    });

    if (addButtons.length === 0) {
      return { item: productName, quantity, status: 'not_found' };
    }

    // 5. Set quantity if > 1 (before clicking add button)
    if (quantity > 1) {
      try {
        const qtyInputs = await chromeTools.find({
          tabId,
          query: 'quantity input'
        });

        if (qtyInputs.length > 0) {
          await chromeTools.type({
            tabId,
            ref: qtyInputs[0].ref,
            element: 'quantity input',
            text: quantity.toString()
          });
        }
      } catch (qtyError) {
        // Quantity input might not be visible yet, continue with default quantity
        console.log(`  ⚠️  Could not set quantity to ${quantity}, using default`);
      }
    }

    // 6. Click first add to basket button (first search result)
    await chromeTools.click({
      tabId,
      ref: addButtons[0].ref,
      element: 'add to basket button'
    });

    // 7. Wait for add confirmation
    await sleep(1000);

    // 8. Small delay to avoid rate limiting
    await sleep(500);

    return { item: productName, quantity, status: 'added' };

  } catch (error) {
    return {
      item: productName,
      quantity,
      status: error.message.includes('not found') ? 'not_found' : 'failed',
      error: error.message
    };
  }
}

/**
 * Add item with retry logic (exponential backoff)
 */
async function addItemWithRetry(chromeTools, tabId, item, maxRetries = 2) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await addItemToBasket(chromeTools, tabId, item.item, item.quantity);

      // If successful or not found, return immediately (don't retry not_found)
      if (result.status === 'added' || result.status === 'not_found') {
        return result;
      }

      // If failed and not last attempt, retry
      if (attempt < maxRetries - 1) {
        await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s
      }
    } catch (error) {
      if (attempt === maxRetries - 1) {
        return {
          item: item.item,
          quantity: item.quantity,
          status: 'failed',
          error: error.message
        };
      }
      await sleep(1000 * Math.pow(2, attempt));
    }
  }

  // Fallback (shouldn't reach here)
  return {
    item: item.item,
    quantity: item.quantity,
    status: 'failed',
    error: 'Max retries exceeded'
  };
}

/**
 * Main function: Populate Waitrose basket with shopping list items
 *
 * @param {Object} chromeTools - Chrome MCP tools object (passed by Claude)
 * @param {Array} items - Shopping list items [{item, quantity, classification, ...}]
 * @param {Object} options - Options {listId}
 * @returns {Object} Results {added: [], failed: []}
 */
export async function populateBasket(chromeTools, items, options = {}) {
  const results = {
    added: [],
    failed: []
  };

  let tabId = null;

  try {
    // Step 1: Initialize Chrome tab
    const context = await chromeTools.tabs_context_mcp({ createIfEmpty: true });
    const tabs = context.tabs || [];

    if (tabs.length === 0) {
      const newTab = await chromeTools.tabs_create_mcp({});
      tabId = newTab.tabId;
    } else {
      tabId = tabs[0].id;
    }

    // Step 2: Ensure authenticated
    await ensureAuthenticated(chromeTools, tabId);

    console.log(`\n🛒 Adding ${items.length} items to basket...\n`);

    // Step 3: Process each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const progress = `(${i + 1}/${items.length})`;

      process.stdout.write(`  ${progress} Adding ${item.item}...`);

      const result = await addItemWithRetry(chromeTools, tabId, item);

      if (result.status === 'added') {
        results.added.push(result);
        console.log(` ✓`);
      } else {
        results.failed.push(result);
        console.log(` ✗ (${result.status})`);
      }
    }

    // Step 4: Navigate to basket page
    console.log('\n🌐 Navigating to basket page...\n');
    await chromeTools.navigate({
      tabId,
      url: 'https://www.waitrose.com/ecom/shop/trolley'
    });

    await sleep(2000); // Let basket page load

    return results;

  } catch (error) {
    console.error('\n❌ Basket automation failed:', error.message);
    throw error;
  }
}
