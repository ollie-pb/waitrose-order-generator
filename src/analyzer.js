/**
 * Pattern analysis module
 * Analyzes shopping patterns to classify items and predict quantities
 */

/**
 * Classify items based on purchase frequency
 * - Regular: appears in >= 40% of orders
 * - Infrequent: appears in < 40% of orders
 * - One-off: appears exactly once (excluded from recommendations)
 */
export function classifyItems(itemFrequencyData) {
  const REGULAR_THRESHOLD = 0.40;

  return itemFrequencyData.map(item => {
    const { product_name, purchase_count, frequency, avg_quantity, last_purchase_date } = item;

    // Classify based on frequency
    let classification;
    if (purchase_count === 1) {
      classification = 'one-off';
    } else if (frequency >= REGULAR_THRESHOLD) {
      classification = 'regular';
    } else {
      classification = 'infrequent';
    }

    return {
      product_name,
      purchase_count,
      frequency,
      avg_quantity,
      last_purchase_date,
      classification
    };
  });
}

/**
 * Calculate days since last purchase for each item
 */
export function calculateDaysSinceLastPurchase(items, currentDate = new Date()) {
  return items.map(item => {
    const lastPurchase = new Date(item.last_purchase_date);
    const daysSince = Math.floor((currentDate - lastPurchase) / (1000 * 60 * 60 * 24));

    return {
      ...item,
      days_since_last_purchase: daysSince
    };
  });
}

/**
 * Calculate purchase intervals for items
 * Returns average days between purchases for predicting next purchase
 */
export function calculatePurchaseIntervals(db, productName) {
  const query = `
    SELECT o.order_date
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.product_name = ?
    ORDER BY o.order_date ASC
  `;

  const purchases = db.prepare(query).all(productName);

  if (purchases.length < 2) {
    return { avg_interval: null, intervals: [] };
  }

  const intervals = [];
  for (let i = 1; i < purchases.length; i++) {
    const prev = new Date(purchases[i - 1].order_date);
    const curr = new Date(purchases[i].order_date);
    const days = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
    intervals.push(days);
  }

  const avg_interval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

  return {
    avg_interval: Math.round(avg_interval),
    intervals,
    std_deviation: calculateStandardDeviation(intervals)
  };
}

/**
 * Calculate standard deviation for consistency measurement
 */
function calculateStandardDeviation(values) {
  if (values.length < 2) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate confidence score for predictions
 * Based on purchase frequency and consistency
 */
export function calculateConfidence(item, intervals) {
  const { purchase_count, frequency } = item;

  // Base confidence from frequency
  let confidence = frequency;

  // Boost for higher purchase counts (up to 10 purchases)
  const countBoost = Math.min(purchase_count / 10, 1) * 0.2;
  confidence += countBoost;

  // Reduce for inconsistent patterns (high std deviation)
  if (intervals && intervals.std_deviation) {
    const { avg_interval, std_deviation } = intervals;
    if (avg_interval > 0) {
      const coefficient_of_variation = std_deviation / avg_interval;
      // Penalize if CV > 0.5 (inconsistent)
      if (coefficient_of_variation > 0.5) {
        confidence *= (1 - coefficient_of_variation * 0.3);
      }
    }
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Predict if an item is likely needed in the next N days
 */
export function predictItemNeed(item, intervals, targetDays = 7) {
  const { days_since_last_purchase, classification } = item;

  // One-off items are never predicted
  if (classification === 'one-off') {
    return false;
  }

  // Add buffer window: include items due within targetDays + 3
  // This ensures we don't miss items coming due soon
  const BUFFER_DAYS = 3;
  const planningWindow = targetDays + BUFFER_DAYS;

  // Regular items: predict if we're close to typical interval
  if (classification === 'regular' && intervals.avg_interval) {
    const expectedNextPurchase = intervals.avg_interval;
    const daysTillDue = expectedNextPurchase - days_since_last_purchase;

    // Due within planning window (target + buffer)
    return daysTillDue <= planningWindow && daysTillDue >= -2; // Allow 2 days overdue
  }

  // Infrequent items: predict if it's been a while
  if (classification === 'infrequent' && intervals.avg_interval) {
    const expectedNextPurchase = intervals.avg_interval;
    const daysTillDue = expectedNextPurchase - days_since_last_purchase;

    // Due within planning window or overdue
    return daysTillDue <= planningWindow;
  }

  return false;
}

/**
 * Calculate recommended quantity based on historical purchases and target days
 */
export function calculateRecommendedQuantity(avgQuantity, intervals, targetDays = 7) {
  if (!intervals || !intervals.avg_interval || intervals.avg_interval === 0) {
    // No interval data, return average
    return Math.round(avgQuantity);
  }

  // Scale quantity based on target days vs typical interval
  const scaleFactor = targetDays / intervals.avg_interval;
  const scaledQuantity = avgQuantity * scaleFactor;

  // Round to sensible values
  if (scaledQuantity < 1) return 1;
  if (scaledQuantity < 3) return Math.round(scaledQuantity);
  // Round to nearest even number for larger quantities
  return Math.round(scaledQuantity / 2) * 2;
}

/**
 * Generate aggregated pattern data for Claude API
 * Returns a JSON structure summarizing purchase patterns
 */
export function generatePatternSummary(classifiedItems, db, targetDays = 7) {
  const regularItems = [];
  const infrequentItems = [];

  for (const item of classifiedItems) {
    if (item.classification === 'one-off') continue;

    const intervals = calculatePurchaseIntervals(db, item.product_name);
    const confidence = calculateConfidence(item, intervals);
    const isNeeded = predictItemNeed(item, intervals, targetDays);

    const itemData = {
      name: item.product_name,
      avgFrequencyDays: intervals.avg_interval,
      avgQuantity: item.avg_quantity,
      lastPurchased: item.last_purchase_date,
      daysSinceLastPurchase: item.days_since_last_purchase,
      confidence,
      isNeeded
    };

    if (item.classification === 'regular') {
      regularItems.push(itemData);
    } else {
      infrequentItems.push(itemData);
    }
  }

  return {
    regularItems: regularItems.filter(i => i.isNeeded),
    infrequentItems: infrequentItems.filter(i => i.isNeeded),
    timeframe: `${targetDays} days`,
    totalOrders: classifiedItems[0]?.purchase_count ? Math.max(...classifiedItems.map(i => i.purchase_count)) : 0
  };
}

/**
 * Main analysis function
 * Takes database and returns pattern summary ready for Claude
 */
export function analyzeShoppingPatterns(db, options = {}) {
  const { targetDays = 7, minOrders = 2 } = options;

  // Import database functions
  import('./database.js').then(({ getItemFrequency }) => {
    const frequency = getItemFrequency(db, { minOrders });
    const classified = classifyItems(frequency);
    const withDays = calculateDaysSinceLastPurchase(classified);
    const summary = generatePatternSummary(withDays, db, targetDays);

    return summary;
  });
}
