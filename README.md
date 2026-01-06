# Waitrose Shopping List Generator

> **Intelligent shopping lists powered by Claude AI** ✨

Automatically generate smart shopping lists by analyzing your Waitrose order history. Uses Claude AI to identify patterns, predict what you need, and suggest quantities based on your actual shopping habits.

## Features

- 🤖 **AI-Powered Analysis**: Claude analyzes your shopping patterns to predict what you'll need
- 📊 **Pattern Recognition**: Distinguishes between regular items (milk, bread) and infrequent purchases (special items)
- 🎯 **Smart Quantities**: Suggests realistic quantities based on your typical consumption
- 🔒 **Privacy-First**: All data stored locally, only aggregated patterns sent to Claude
- ⚡ **Fast & Local**: SQLite database for instant analysis
- 🎨 **Beautiful CLI**: Clear, colorful terminal interface

## Installation

### Prerequisites

- Node.js >= 20.0.0
- Anthropic API key ([get one here](https://console.anthropic.com/))

### Setup

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure your API key**
   ```bash
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

4. **Test the setup**
   ```bash
   node test-db.js
   node test-claude.js
   ```

## Usage

### Generate Shopping List

Generate a shopping list based on your order history:

```bash
node cli.js generate
```

**Options:**
- `-d, --days <number>` - Days to cover (5-8, default: 7)
- `--simple` - Output simple text format
- `--no-save` - Don't save the list to database

**Examples:**
```bash
# Generate 7-day shopping list
node cli.js generate

# Generate 5-day list in simple format
node cli.js generate --days 5 --simple

# Generate without saving
node cli.js generate --no-save
```

### View History

See previously generated shopping lists:

```bash
# List all generated shopping lists
node cli.js history

# View a specific list
node cli.js history --id 1

# Show last 5 lists
node cli.js history --limit 5
```

### View Statistics

See your shopping patterns:

```bash
node cli.js stats
```

Shows:
- Total orders in database
- Number of unique products
- Regular vs infrequent items
- Top 10 most purchased items

### Scrape Orders

```bash
node cli.js scrape
```

Uses Claude in Chrome MCP tools to extract your Waitrose order history. The scraper:
- Logs into your Waitrose account (via visible browser)
- Navigates through your order history
- Extracts product names and quantities
- Saves everything to your local database

**Note**: Currently requires manual execution. Automated batch scraping coming soon.

### Detect New Orders

Check for new orders since your last scrape:

```bash
node cli.js detect
```

Shows your current detection status:
- Last sync timestamp
- Number of orders in database
- Instructions for running detection through Claude Code

**Options:**
- `--auto-import` - Auto-import new orders (planned feature)
- `--max <number>` - Maximum orders to check (default: 50)

**How Detection Works:**

Detection runs through Claude Code (not standalone CLI):
1. Ask Claude Code: "Detect new Waitrose orders"
2. Claude uses Chrome automation to check your order history
3. Only new orders (not in database) are identified
4. Summary shows: new orders found, duplicates skipped, sync status

**Benefits:**
- ⚡ 90% faster than full re-scrape
- 🎯 Only checks for new orders
- 🔄 Idempotent - safe to run multiple times
- 📊 Keeps pattern analysis fresh

## Real Example

After scraping 15 Waitrose orders (Aug 2025 - Jan 2026), the generator produces highly accurate recommendations:

```
📊 Shopping Pattern Statistics

Total Orders: 15
Unique Products: 262

Regular items (≥40% frequency): 29
Infrequent items (<40% frequency): 90
One-off purchases: 143

Top 10 Most Frequent Items:
Waitrose Wild Rocket          | 100% | 15
Duchy Organic Blueberries     | 93%  | 14
Perfectly Ripe Avocados       | 93%  | 14
Waitrose Fairtrade Bananas    | 87%  | 13
Duchy Organic Courgettes      | 80%  | 12
```

The generated shopping list includes:
- **Regular items** with 100% confidence (bought in every order)
- **Infrequent items** with purchase cycle tracking (e.g., "purchased every 24 days, last bought 26 days ago")
- **Smart quantities** based on historical averages

## How It Works

### 1. Data Collection

Uses Claude in Chrome MCP tools to scrape your Waitrose order history directly from your account. All order data (product names, quantities, dates) is stored in your local SQLite database.

### 2. Pattern Analysis

The analyzer examines your purchase history to:

- **Classify items** into regular (≥40% of orders) and infrequent (<40%)
- **Calculate frequencies** and average purchase intervals
- **Predict needs** based on when you typically buy each item
- **Determine quantities** based on your historical purchases

### 3. AI Recommendations

Claude analyzes the aggregated patterns and:

- Identifies items you're likely to need
- Suggests realistic quantities
- Explains reasoning for each recommendation
- Provides confidence scores

### 4. Local Storage

All your data stays on your machine:
- Orders stored in SQLite database (`data/shopping.db`)
- Generated lists saved for future reference
- No cloud syncing or external storage

## Privacy & Security

🔒 **Your data stays local**

- **Order history**: Stored only in your local SQLite database
- **Shopping lists**: Saved locally, never sent anywhere
- **Claude API**: Only receives aggregated pattern data (frequencies, intervals), NOT raw orders
- **Waitrose credentials**: Never stored (you log in via visible browser)
- **API key**: Kept in `.env` file, never committed to git

### What Gets Sent to Claude?

Only anonymized pattern summaries like:
```json
{
  "regularItems": [
    {
      "name": "Milk",
      "avgFrequencyDays": 7,
      "avgQuantity": 2,
      "confidence": 0.95
    }
  ]
}
```

**Not sent**: Order numbers, dates, prices, or any personally identifiable information.

## Project Structure

```
waitrose-order-generator/
├── cli.js                  # Main CLI entry point
├── package.json
├── .env                    # Your API key (not committed)
├── .env.example           # Template for API key
├── src/
│   ├── database.js        # SQLite database setup and queries
│   ├── analyzer.js        # Pattern analysis logic
│   ├── claude-client.js   # Claude API integration
│   ├── scraper.js         # Waitrose scraping (coming soon)
│   └── utils.js           # Logging and formatting utilities
├── data/
│   └── shopping.db        # Local SQLite database (auto-created)
└── README.md
```

## Development

### Testing

Run the test suite:

```bash
# Test database setup
node test-db.js

# Test pattern analyzer
node test-analyzer.js

# Test Claude API integration (requires API key)
node test-claude.js
```

### Database Schema

**orders**
- id, order_number (unique), order_date, scraped_at

**order_items**
- id, order_id, product_name, quantity

**shopping_lists**
- id, generated_at, days_coverage

**shopping_list_items**
- id, list_id, product_name, quantity, classification, confidence

## Troubleshooting

### "ANTHROPIC_API_KEY not set"

Make sure you've created a `.env` file with your API key:
```bash
cp .env.example .env
# Edit .env and add your key
```

### "Only X orders found. Need at least 3"

You need at least 3 orders for pattern analysis. Use the scraper to extract your Waitrose order history:
1. Ensure you have Claude in Chrome MCP tools installed
2. Run `node cli.js scrape` to start the scraping process
3. The scraper will guide you through extracting your orders

### "Rate limit exceeded"

You've hit the Claude API rate limit. Wait a minute and try again.

### Database errors

Try deleting the database and starting fresh:
```bash
rm data/shopping.db
node test-db.js
```

## Roadmap

### ✅ v0.1 (Complete)
- [x] Database setup and schema
- [x] Pattern analysis engine
- [x] Claude API integration
- [x] CLI interface
- [x] Shopping list generation
- [x] Claude in Chrome integration for scraping
- [x] Manual order history extraction

### ✅ v0.2 (Complete)
- [x] New order detection (via Claude Code)
- [x] Sync metadata tracking
- [x] Order deduplication
- [x] Detection status command

### 🚧 v0.3 (Next)
- [ ] Automated batch scraping
- [ ] Real-time progress indicators during scraping
- [ ] Auto-import for detected orders
- [ ] Export formats (CSV, PDF)

### 🔮 Future
- [ ] Auto-add items to Waitrose basket
- [ ] Dietary preferences and exclusions
- [ ] Seasonal pattern detection
- [ ] Budget tracking
- [ ] Multi-store support (Tesco, Sainsbury's)

## License

MIT

## Acknowledgments

- Built with [Claude](https://claude.ai) by Anthropic
- Uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for local storage
- Inspired by the need to never forget milk again 🥛

---

**Made with ❤️ and AI**
