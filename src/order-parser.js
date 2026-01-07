/**
 * Order parsing utilities
 * Extracts order numbers and dates from Waitrose page content
 */

// Maximum page size to prevent ReDoS attacks (500KB)
const MAX_PAGE_SIZE = 500000;

/**
 * Parse orders from page text
 * Extracts order numbers and dates from Waitrose order history
 * Protected against ReDoS attacks with input size limits
 */
export function parseOrdersFromText(pageText) {
  const orders = [];

  try {
    // CRITICAL: Limit input size to prevent ReDoS attacks
    if (pageText.length > MAX_PAGE_SIZE) {
      console.warn(`Page truncated: ${pageText.length} > ${MAX_PAGE_SIZE}`);
      pageText = pageText.substring(0, MAX_PAGE_SIZE);
    }

    // Extract order numbers (format: #1234567890)
    // Word boundary added to prevent catastrophic backtracking
    const orderNumberPattern = /#(\d{10})\b/g;
    const orderNumbers = [];
    let match;

    while ((match = orderNumberPattern.exec(pageText)) !== null) {
      orderNumbers.push(match[1]);
    }

    // Extract dates (format: "Saturday 3 January", "Thursday 11 December", etc.)
    // Word boundaries added to prevent catastrophic backtracking
    const datePattern = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/g;
    const dates = [];

    while ((match = datePattern.exec(pageText)) !== null) {
      const dateStr = `${match[2]} ${match[3]}`; // "3 January"
      const parsedDate = parseDateString(dateStr);
      if (parsedDate) {
        dates.push(parsedDate);
      }
    }

    // Match order numbers with dates (they should appear in pairs)
    const minLength = Math.min(orderNumbers.length, dates.length);

    for (let i = 0; i < minLength; i++) {
      orders.push({
        order_number: orderNumbers[i],
        order_date: dates[i],
        items: [] // Detection doesn't extract full item details
      });
    }

    console.log(`📋 Parsed ${orders.length} orders from page`);

  } catch (error) {
    console.error('Error parsing orders:', error.message);
  }

  return orders;
}

/**
 * Parse date string to ISO format
 * Converts "3 January" to "2025-01-03" (assuming current year)
 */
export function parseDateString(dateStr) {
  try {
    const currentYear = new Date().getFullYear();
    const fullDateStr = `${dateStr} ${currentYear}`;
    const date = new Date(fullDateStr);

    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().split('T')[0];
  } catch (error) {
    return null;
  }
}
