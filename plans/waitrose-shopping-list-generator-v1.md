# Waitrose Shopping List Generator v1

**Type:** New Feature
**Status:** Planning
**Created:** 2026-01-05

## Overview

Build a local-first CLI application that automatically generates intelligent shopping lists by analyzing Waitrose order history using Claude AI. The app uses **Playwright + Claude API in autonomous agent mode** - Playwright controls the browser while Claude analyzes screenshots and decides what actions to take. This provides resilience against site changes and bot detection.

**Core Value:** Save time and mental energy by letting AI predict your shopping needs based on actual purchase patterns, then optionally auto-add items to your Waitrose basket.

## Problem Statement

Creating shopping lists from memory is time-consuming and error-prone. Users forget regular items (milk, bread) and don't account for consumption patterns of infrequent items (cleaning supplies every 6 weeks). Additionally, manually adding items to online shopping baskets is tedious.

## Proposed Solution

A Node.js CLI tool that uses **autonomous browser agents** (Playwright + Claude vision):

1. **Pattern Analysis Flow:**
   - Playwright opens Waitrose order history
   - Claude analyzes screenshots to navigate and extract orders (no hardcoded selectors)
   - Stores order data locally in SQLite
   - Analyzes patterns locally (frequency, quantity, intervals)
   - Claude generates intelligent shopping list for 5-8 days

2. **Future: Auto-Add to Basket Flow:**
   - User reviews generated list
   - Playwright + Claude navigate Waitrose, search for items, add to basket
   - Claude adapts to any UI changes or layout variations

**Key Technical Decisions:**
- **Playwright + Claude API (autonomous agent)** - resilient to DOM changes, no bot detection issues
- **Claude vision/computer use** - analyzes screenshots to find elements dynamically
- **Node.js CLI** - simplest for v1, perfect for local use
- **better-sqlite3** - fast, synchronous, excellent for pattern queries
- **Claude Sonnet 4.5** - needed for vision/computer use capabilities
- **Privacy-first** - all data stays local, screenshots only sent for navigation

## Acceptance Criteria

### Core Functionality

- [ ] User can install the CLI tool globally or run locally
- [ ] User can configure Anthropic API key via environment variable
- [ ] User can trigger shopping list generation with single command
- [ ] App launches Playwright browser (visible for user to handle login)
- [ ] Claude analyzes screenshots to navigate Waitrose order history pages
- [ ] Claude extracts order data by reading screenshots (no hardcoded selectors)
- [ ] App scrapes last 6 months or 50 orders (whichever is fewer)
- [ ] App stores orders in local SQLite database
- [ ] App analyzes patterns: regular items (appear in 40%+ of orders) vs infrequent
- [ ] App calculates average quantities for each item
- [ ] Claude generates shopping list based on pattern analysis
- [ ] App displays list in terminal grouped by classification (regular/infrequent)
- [ ] App saves generated list to database with timestamp

### Autonomous Browser Navigation

- [ ] Claude receives screenshot of current page
- [ ] Claude identifies next action needed (click, scroll, extract data)
- [ ] Playwright executes action based on Claude's instructions
- [ ] Loop continues until all orders are scraped
- [ ] Handles pagination, dropdowns, dynamic content automatically
- [ ] No hardcoded CSS selectors - Claude finds elements visually

### Data Requirements

- [ ] Database schema includes: `orders`, `order_items`, `shopping_lists`, `shopping_list_items`
- [ ] Each order captures: order_number, order_date, items with quantities
- [ ] Pattern analysis tracks: item frequency, avg quantity, last purchase date
- [ ] Shopping list includes: item name, quantity, classification, confidence score

### Error Handling

- [ ] Graceful failure if Playwright can't launch (clear error message)
- [ ] Graceful failure if Waitrose login fails (prompt user to check credentials)
- [ ] Graceful failure if Claude API errors (show error, save what data we have)
- [ ] Retry logic for transient network errors (3 retries with exponential backoff)
- [ ] Claude can recover from navigation errors (retry with different approach)
- [ ] Clear error if no order history found (require minimum 3 orders)

### Privacy & Security

- [ ] Never store Waitrose credentials
- [ ] API key stored in `.env` file only (never committed)
- [ ] Screenshots sent to Claude are temporary (order history pages only)
- [ ] SQLite database has restrictive file permissions
- [ ] README clearly explains what data is collected and sent to Claude

### User Experience

- [ ] Progress indicators during navigation ("Navigating to order history...")
- [ ] Progress indicators during scraping ("Analyzing order 5/47...")
- [ ] Progress indicators during AI analysis ("Generating recommendations...")
- [ ] Output is readable and copy-paste friendly
- [ ] Help command shows usage and options
- [ ] Error messages are helpful and actionable

## Context

### Architectural Decision: Why Autonomous Agent Pattern?

**Traditional Scraper Risks:**
- Hardcoded CSS selectors break when Waitrose redesigns
- Bot detection blocks automated scraping
- Brittle against UI changes

**Autonomous Agent Benefits:**
- Claude adapts to layout changes by analyzing screenshots
- Real browser with user credentials = no bot detection
- Future-proof for basket automation (Claude can click "Add to basket" regardless of API changes)
- Reduces maintenance burden (no selector updates needed)

**Trade-offs:**
- Higher Claude API costs (vision/computer use)
- Slower than direct scraping (screenshot analysis per action)
- **Acceptable for v1** since we're not operating at scale

### How Autonomous Agent Pattern Works

```
┌─────────────────────────────────────────────────┐
│ 1. Playwright takes screenshot of current page  │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│ 2. Send screenshot to Claude with task:         │
│    "Navigate to order history and extract data" │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│ 3. Claude analyzes image and returns action:    │
│    {"action": "click", "element": "My Orders",  │
│     "coordinates": [120, 340]}                  │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│ 4. Playwright executes action                   │
└────────────────┬────────────────────────────────┘
                 │
                 └──► Repeat until task complete
```

**Reference:** [Claude Autonomous Browser Agent](https://github.com/anthropics/claude-quickstarts) from Anthropic's quickstarts

### Research Findings

**Claude Computer Use API:**
- Claude Sonnet 4.5 required for vision + computer use
- Can analyze screenshots and provide precise coordinates for clicks
- Handles dynamic content, modals, pagination automatically
- Source: [Anthropic Computer Use Guide](https://docs.anthropic.com/en/docs/computer-use)

**Better-sqlite3:**
- Outperforms node-sqlite3 significantly (synchronous is faster for local apps)
- Excellent for pattern analysis with proper indexing
- Source: [Understanding Better-SQLite3](https://dev.to/lovestaco/understanding-better-sqlite3-the-fastest-sqlite-library-for-nodejs-4n8)

**Pattern Analysis:**
- Temporal pattern mining identifies regular vs infrequent purchases
- Key metrics: frequency, recency, quantity variance, prediction confidence
- Source: [Temporal Pattern Mining Research](https://pmc.ncbi.nlm.nih.gov/articles/PMC8623780/)

### Critical Clarifications from SpecFlow Analysis

**Authentication:** Use visible browser for user to login manually (handles 2FA/MFA, avoids credential storage)

**Data Scope:** Last 6 months or 50 orders, whichever is fewer (balances pattern quality vs performance)

**Regular vs Infrequent:** Regular = appears in ≥40% of orders; Infrequent = <40%; One-off = appears once (excluded from predictions)

**Quantity Logic:** Average quantity from last 5 occurrences, scaled to 5-8 day coverage window

**Navigation Strategy:** Claude-driven, screenshot-based (no hardcoded selectors)

## Implementation Overview

### Project Structure

```
waitrose-order-generator/
├── cli.js                    # Main entry point
├── package.json
├── .env.example             # Template for API key
├── .gitignore
├── src/
│   ├── agent.js            # Autonomous browser agent (Playwright + Claude)
│   ├── database.js         # SQLite setup, schema, queries
│   ├── analyzer.js         # Pattern analysis (frequency, quantities)
│   ├── claude-client.js    # Claude API integration
│   └── utils.js            # Helpers (logging, formatting)
├── data/
│   └── shopping.db         # SQLite database (gitignored)
└── README.md
```

### Core Components

**1. CLI Interface (`cli.js`)**
```javascript
#!/usr/bin/env node
// Use commander.js for CLI
// Commands: generate (default), add-to-basket (future), view-history
// Flags: --days <5-8>, --refresh (force re-scrape)
```

**2. Autonomous Agent (`agent.js`)**
```javascript
// Initialize Playwright browser
// Loop: screenshot → Claude analysis → action → repeat
// Actions: navigate, click, scroll, extract_text
// Returns: structured order data
// Handles: pagination, dynamic content, navigation errors
```

**3. Claude Client (`claude-client.js`)**
```javascript
// Two modes:
// 1. Navigation mode: send screenshot, get action instructions
// 2. Analysis mode: send pattern data, get shopping list
// Use Claude Sonnet 4.5 for computer use capabilities
// Handle errors, rate limits (retry with backoff)
```

**4. Database (`database.js`)**
```javascript
// Initialize better-sqlite3 with WAL mode
// Schema: orders, order_items, shopping_lists, shopping_list_items
// Queries: insertOrder, getRecentOrders, getItemFrequency
// Indexes on: order_date, item_name
```

**5. Pattern Analyzer (`analyzer.js`)**
```javascript
// Calculate item frequency (% of orders containing item)
// Classify: regular (≥40%), infrequent (<40%), one-off (1 occurrence)
// Calculate average quantities
// Predict next purchase date based on intervals
// Format data for Claude's shopping list generation
```

### Database Schema

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE,
  order_date TEXT NOT NULL,
  scraped_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE shopping_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  days_coverage INTEGER NOT NULL
);

CREATE TABLE shopping_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  classification TEXT CHECK(classification IN ('regular', 'infrequent')),
  confidence REAL,
  FOREIGN KEY (list_id) REFERENCES shopping_lists(id)
);

CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_items_name ON order_items(product_name);
```

### Autonomous Agent Flow

**Navigation Task Prompt:**
```
You are controlling a web browser to scrape Waitrose order history.

Current screenshot: [image]

Task: Navigate to the order history page and extract all orders from the last 6 months.

Available actions:
- click(x, y): Click at coordinates
- scroll(direction): Scroll up/down
- extract_text(region): Extract text from screen region
- navigate_complete(): Mark navigation as done

Return JSON with your next action:
{
  "action": "click" | "scroll" | "extract_text" | "navigate_complete",
  "x": number (for click),
  "y": number (for click),
  "direction": "up" | "down" (for scroll),
  "region": {"x": number, "y": number, "width": number, "height": number} (for extract),
  "reasoning": "why you chose this action"
}

If you see order history data, use extract_text to capture it.
When all orders are extracted, return navigate_complete.
```

**Shopping List Generation Prompt:**
```
You are a shopping pattern analyst. Based on the purchase history below,
suggest items the user likely needs for the next 5-8 days.

Purchase Patterns:
{aggregated_patterns_json}

Return a JSON object with this exact structure:
{
  "recommendations": [
    {
      "item": "item name",
      "quantity": number,
      "classification": "regular" | "infrequent",
      "reason": "brief explanation",
      "confidence": 0.0-1.0
    }
  ]
}

Focus on:
1. Items with regular purchase patterns that are due
2. Infrequent items if enough time has passed since last purchase
3. Realistic quantities based on typical consumption
4. Exclude obvious one-off purchases (birthday cakes, etc.)
```

## MVP Implementation Checklist

**Phase 1: Setup**
- [ ] `package.json`: Initialize with "type": "module"
- [ ] Install: `@anthropic-ai/sdk`, `playwright`, `better-sqlite3`, `commander`, `chalk`, `dotenv`
- [ ] `.env.example`: Template with `ANTHROPIC_API_KEY=your_key_here`
- [ ] `.gitignore`: Add `.env`, `data/`, `node_modules/`

**Phase 2: Database (`src/database.js`)**
- [ ] Initialize better-sqlite3 with WAL mode
- [ ] Create schema (orders, order_items, shopping_lists, shopping_list_items)
- [ ] Add indexes for performance
- [ ] Write queries: insertOrder, getRecentOrders, getItemFrequency, saveShoppingList

**Phase 3: Claude Client (`src/claude-client.js`)**
- [ ] Initialize Anthropic client with Sonnet 4.5
- [ ] Implement navigation mode: screenshot → action instructions
- [ ] Implement analysis mode: patterns → shopping list
- [ ] Add retry logic for rate limits/errors
- [ ] Parse and validate JSON responses

**Phase 4: Autonomous Agent (`src/agent.js`)**
- [ ] Launch Playwright browser (visible mode)
- [ ] Navigate to Waitrose.com
- [ ] Wait for user authentication
- [ ] Main loop: screenshot → Claude → execute action → repeat
- [ ] Implement action handlers: click, scroll, extract_text
- [ ] Extract order data from screenshots
- [ ] Handle pagination and dynamic content
- [ ] Return structured order data

**Phase 5: Pattern Analysis (`src/analyzer.js`)**
- [ ] Calculate frequency for each unique item
- [ ] Classify items: regular (≥40%), infrequent (<40%), exclude one-offs
- [ ] Calculate average quantities from last 5 purchases
- [ ] Calculate days since last purchase
- [ ] Format aggregated patterns for Claude

**Phase 6: CLI Interface (`cli.js`)**
- [ ] Set up commander.js with commands
- [ ] Implement `generate` command (default)
- [ ] Add progress indicators with chalk/ora
- [ ] Display shopping list in terminal (grouped by classification)
- [ ] Save generated list to database

**Phase 7: Documentation (`README.md`)**
- [ ] Installation instructions (Node.js, dependencies)
- [ ] API key setup guide (get Anthropic key, add to .env)
- [ ] Usage examples (basic command, flags)
- [ ] Privacy policy (screenshots sent to Claude for navigation only)
- [ ] Troubleshooting (common errors and fixes)

## Testing Strategy

**Manual Testing Checklist:**
- [ ] Test with fresh database (first run)
- [ ] Test with existing data (subsequent runs)
- [ ] Test authentication flow with 2FA enabled
- [ ] Test Claude navigation on current Waitrose layout
- [ ] Test with invalid API key (should error clearly)
- [ ] Test with no API key set (should error clearly)
- [ ] Test network interruption during scraping (should retry)
- [ ] Test Claude API rate limit (should retry with backoff)
- [ ] Verify Claude can find orders on page (screenshot analysis works)
- [ ] Verify extracted data is accurate (spot check against actual orders)
- [ ] Test with 0-2 orders (should error gracefully)
- [ ] Test with 50+ orders (should handle pagination)

**Waitrose Layout Change Simulation:**
- [ ] Test resilience by asking Claude to navigate slightly modified page
- [ ] Verify Claude adapts without code changes

**Edge Cases:**
- [ ] Item appears in only 1 order (should be excluded)
- [ ] Item has wildly varying quantities (use average, flag low confidence)
- [ ] No orders in last 6 months but has older orders (should warn user)
- [ ] Claude gets stuck in navigation loop (implement max iterations)

## Success Metrics

**Functional Success:**
- ✅ App successfully scrapes order history via autonomous agent
- ✅ Claude correctly identifies and clicks navigation elements 90%+ of time
- ✅ Pattern analysis identifies clear regular vs infrequent items
- ✅ Generated shopping list contains 80%+ items user actually needs
- ✅ No crashes or data corruption across 10 test runs

**Resilience Success:**
- ✅ App continues to work if Waitrose makes minor UI changes
- ✅ Claude recovers from navigation errors without manual intervention
- ✅ No hardcoded selectors need updating when Waitrose redesigns

**User Experience Success:**
- ✅ Setup takes <5 minutes (install, API key, first run)
- ✅ Scraping + generation completes in reasonable time (<10 mins for 50 orders)
- ✅ Error messages are clear enough for user to self-resolve
- ✅ Output is readable and copy-paste friendly

**Privacy Success:**
- ✅ No Waitrose credentials stored
- ✅ API key not exposed in code or logs
- ✅ Screenshots only sent for navigation (not stored permanently)

## Known Risks & Mitigation

**Risk: Higher Claude API costs (vision/computer use)**
- **Impact:** More expensive per run than hardcoded scraping
- **Mitigation:** Acceptable for personal use, not scaling to 1000s of users
- **Monitor:** Log token usage per request
- **Future:** Cache navigation paths, only use vision when layout changes detected

**Risk: Slower scraping (screenshot analysis)**
- **Impact:** Takes longer than direct DOM access
- **Mitigation:** Progress indicators keep user informed
- **Acceptable:** v1 is for personal use, not time-critical
- **Future:** Optimize by caching successful navigation sequences

**Risk: Claude navigation failures**
- **Impact:** Gets stuck or can't find elements
- **Mitigation:** Max iteration limit (20 actions), then fail with clear error
- **Fallback:** User can retry or report issue
- **Future:** Implement fallback strategies, learn from failures

**Risk: Waitrose detects unusual activity**
- **Impact:** Account flagged or blocked
- **Mitigation:** Real browser with user auth, realistic delays between actions
- **Monitor:** User reports any account issues

**Risk: Poor recommendations**
- **Impact:** User loses trust, doesn't use app
- **Mitigation:** Start conservative (only high-confidence items)
- **Validate:** Manual testing with real order history
- **Future:** User feedback loop to improve

## Future Enhancements (Post-v1)

**Phase 2: Auto-Add to Basket**
- [ ] Extend autonomous agent to add items to Waitrose basket
- [ ] User reviews list, approves items to add
- [ ] Claude navigates, searches for each item, clicks "Add to basket"
- [ ] Handles out-of-stock items, substitutions

**Phase 3: Improvements**
- [ ] Interactive mode to adjust/remove items before finalizing
- [ ] Support for dietary preferences and exclusions
- [ ] Seasonal pattern detection (BBQ items in summer)
- [ ] Budget tracking and price predictions
- [ ] Web GUI or desktop app with Tauri

**Phase 4: Multi-Store Support**
- [ ] Extend to other grocers (Tesco, Sainsbury's)
- [ ] Unified shopping list across stores
- [ ] Price comparison

## References & Research

**Autonomous Browser Agents:**
- [Claude Quickstarts - Browser Automation](https://github.com/anthropics/claude-quickstarts)
- [Anthropic Computer Use Documentation](https://docs.anthropic.com/en/docs/computer-use)

**Browser Automation:**
- [Playwright Documentation](https://playwright.dev)
- [Making Playwright Undetectable](https://scrapeops.io/playwright-web-scraping-playbook/nodejs-playwright-make-playwright-undetectable/)

**Database:**
- [better-sqlite3 NPM Package](https://www.npmjs.com/package/better-sqlite3)
- [Understanding Better-SQLite3](https://dev.to/lovestaco/understanding-better-sqlite3-the-fastest-sqlite-library-for-nodejs-4n8)

**Claude API:**
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)
- [Claude API Integration Guide 2025](https://collabnix.com/claude-api-integration-guide-2025-complete-developer-tutorial-with-code-examples/)

**Pattern Analysis:**
- [Temporal Pattern Mining for Shopping](https://pmc.ncbi.nlm.nih.gov/articles/PMC8623780/)
- [Frequent Itemsets Recommendation](https://towardsdatascience.com/the-frequently-bought-together-recommendation-system-b4ed076b24e5/)

**Node.js CLI Best Practices:**
- [Node.js CLI Apps Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices)

---

**Next Steps:** Review this plan, then proceed with implementation starting at Phase 1.