# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local-first CLI application that analyzes Waitrose order history and generates intelligent shopping lists using Claude AI. All order data is stored locally in SQLite; only anonymized pattern summaries are sent to Claude API for recommendations.

**Tech Stack:**
- Node.js with ES modules (`"type": "module"`)
- SQLite via better-sqlite3 (synchronous API)
- Claude Sonnet 4.5 API (@anthropic-ai/sdk)
- Commander.js for CLI
- Claude in Chrome MCP tools for browser automation

## Core Commands

### Running the CLI
```bash
# Generate shopping list (default 7 days)
node cli.js generate

# Generate with options
node cli.js generate --days 5 --simple --no-save

# View statistics
node cli.js stats

# View shopping list history
node cli.js history
node cli.js history --id 1
```

### Testing
```bash
# Test individual modules (in test/ directory)
node test/test-db.js       # Database setup and queries
node test/test-analyzer.js # Pattern analysis
node test/test-claude.js   # Claude API (requires ANTHROPIC_API_KEY)
```

### Development
```bash
npm install              # Install dependencies
cp .env.example .env     # Set up API key
node --watch cli.js      # Watch mode for development
```

## Architecture

### Three-Stage Pipeline

The application follows a clear data pipeline:

**1. Data Layer (src/database.js)**
- SQLite database with WAL mode enabled for performance
- Synchronous API (better-sqlite3)
- Schema: `orders` → `order_items` (normalized), `shopping_lists` → `shopping_list_items`
- Key queries: `getItemFrequency()` calculates purchase frequency and avg quantities

**2. Analysis Layer (src/analyzer.js)**
- Pattern classification: Regular (≥40% frequency), Infrequent (<40%), One-off (excluded)
- Temporal analysis: days since last purchase, purchase intervals
- Confidence scoring based on consistency
- Output: Anonymized pattern summary for Claude API (no order numbers, dates, or PII)

**3. AI Layer (src/claude-client.js)**
- Uses Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- Input: Pattern summaries only (privacy-first design)
- Output: Structured recommendations with quantities and confidence scores
- Parsing: Regex-based extraction from Claude's text response

### Data Flow

```
Waitrose Orders (scraped/manual)
    ↓
SQLite Database (local only)
    ↓
Pattern Analysis (frequencies, intervals, classifications)
    ↓
Anonymized Pattern Summary (no PII)
    ↓
Claude API (recommendations)
    ↓
Shopping List (saved to SQLite)
```

### Privacy Architecture

**Local Only:**
- Raw order data (numbers, dates, items, quantities)
- Generated shopping lists
- User credentials (never stored)

**Sent to Claude:**
- Product names
- Aggregated frequencies (e.g., "40% of orders")
- Average quantities
- Days since last purchase
- NO order numbers, dates, prices, or identifiers

## Key Design Decisions

### Pattern Analysis Threshold
- **Regular items:** ≥40% frequency (appears in 40%+ of orders)
- **Infrequent items:** <40% frequency but purchased 2+ times
- **One-off items:** Purchased exactly once (excluded from recommendations)

This threshold is configurable in `src/analyzer.js::classifyItems()` via `REGULAR_THRESHOLD`.

### Database Design
- **Normalized schema:** Orders separate from items (many-to-many via `order_id`)
- **WAL mode:** Better concurrency, atomic commits
- **Unique constraint:** `order_number` prevents duplicate scraping
- **Indexes:** On `order_id` and `product_name` for query performance

### Claude API Integration
- **Model:** Sonnet 4.5 (high quality, reasonable cost)
- **Max tokens:** 2048 (sufficient for shopping lists)
- **Error handling:** Rate limits (429), auth errors (401) with user-friendly messages
- **Response parsing:** Structured text format parsed via regex (see `parseRecommendations()`)

### Browser Automation
- Uses Claude in Chrome MCP tools (not custom Playwright)
- Manual login flow (credentials never stored)
- Page text extraction via `get_page_text()` (avoids DOM size limits)
- Orders saved individually via scripts (see deleted `save-*.js` pattern)

## Module Responsibilities

**cli.js** - Commander.js interface, orchestrates all commands, handles user I/O

**src/database.js** - All SQLite operations, schema initialization, queries

**src/analyzer.js** - Pure functions for pattern analysis, no I/O or side effects

**src/claude-client.js** - Claude API wrapper, prompt building, response parsing

**src/utils.js** - Terminal formatting (chalk), logging, shopping list display

**src/chrome-scraper.js** - Integration with Claude in Chrome MCP tools (in progress)

**src/scraper.js** - Abstract scraper interface (placeholder for future multi-store support)

## Environment Setup

Required environment variable:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

The app will throw clear errors if API key is missing or invalid.

## Database Location

`data/shopping.db` (auto-created, gitignored)

Reset database:
```bash
rm data/shopping.db
node test/test-db.js  # Recreates with test data
```

## Common Patterns

### Adding New Analysis Functions

Pattern analysis functions in `src/analyzer.js` follow this pattern:
1. Pure function (no database access)
2. Takes item frequency data as input
3. Returns enriched data with new fields
4. Chain multiple functions in `cli.js` (see generate command)

Example:
```javascript
const frequency = getItemFrequency(db, { minOrders: 2 });
const classified = classifyItems(frequency);
const withDays = calculateDaysSinceLastPurchase(classified);
const summary = generatePatternSummary(withDays, db, daysCoverage);
```

### Adding New CLI Commands

Use Commander.js pattern in `cli.js`:
```javascript
program
  .command('command-name')
  .description('Description')
  .option('-f, --flag <value>', 'Description', 'default')
  .action(async (options) => {
    const spinner = ora('Loading...').start();
    try {
      // Command logic
      spinner.succeed('Done');
    } catch (error) {
      spinner.fail('Failed');
      displayError(error);
      process.exit(1);
    }
  });
```

### Browser Scraping Pattern

When scraping new orders:
1. Navigate to Waitrose order history
2. Click through to individual order
3. Use `get_page_text()` to extract order details
4. Parse text manually (create temporary save script)
5. Use `insertOrder()` and `insertOrderItems()` to save

See git history for `save-real-order.js` and `save-order-dec11.js` examples.

## Node Version

Requires Node.js ≥20.0.0 for:
- ES modules support
- Modern async/await patterns
- Chalk v5, Ora v8 compatibility
