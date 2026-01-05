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

### Scrape Orders (Coming Soon)

```bash
node cli.js scrape
```

Will use Claude in Chrome to automatically extract your Waitrose order history.

## How It Works

### 1. Data Collection

Currently uses test data. Claude in Chrome integration coming soon to automatically scrape your Waitrose order history.

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

You need at least 3 orders for pattern analysis. Options:
1. Wait for scraper implementation
2. Add more test data via `test-db.js`
3. Manually add orders to the database

### "Rate limit exceeded"

You've hit the Claude API rate limit. Wait a minute and try again.

### Database errors

Try deleting the database and starting fresh:
```bash
rm data/shopping.db
node test-db.js
```

## Roadmap

### ✅ v0.1 (Current)
- [x] Database setup and schema
- [x] Pattern analysis engine
- [x] Claude API integration
- [x] CLI interface
- [x] Shopping list generation

### 🚧 v0.2 (Next)
- [ ] Claude in Chrome integration for scraping
- [ ] Automatic order history extraction
- [ ] Real-time progress indicators during scraping

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
