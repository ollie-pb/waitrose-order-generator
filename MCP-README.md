# Waitrose Shopping List MCP Server

MCP (Model Context Protocol) server that exposes Waitrose shopping list generation as tools for Claude and other AI assistants.

## Features

The MCP server provides four tools:

### 1. `generate_shopping_list`
Generate an intelligent shopping list based on your Waitrose order history.

**Parameters:**
- `days` (optional): Number of days to cover (5-8, default: 7)
- `save` (optional): Whether to save the list to database (default: true)

**Returns:** Shopping list with AI-recommended items and quantities

### 2. `get_statistics`
View shopping pattern statistics including:
- Total orders and unique products
- Item classifications (regular, infrequent, one-off)
- Top 10 most frequently purchased items

**Parameters:** None

### 3. `get_shopping_history`
List all previously generated shopping lists.

**Parameters:**
- `limit` (optional): Maximum number of lists to return (1-100, default: 10)

### 4. `get_shopping_list`
Get detailed information about a specific shopping list.

**Parameters:**
- `list_id` (required): The ID of the shopping list to retrieve

## Installation

### Prerequisites

1. Node.js >= 20.0.0
2. Anthropic API key (for Claude AI)
3. Waitrose order data in the SQLite database

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

3. **Add order data:**
   - Run the CLI to scrape orders: `node cli.js scrape`
   - Or use test data: `node test/test-db.js`

## Configuration

### Claude Desktop

Add this configuration to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "waitrose-shopping": {
      "command": "node",
      "args": ["/absolute/path/to/waitrose-order-generator/mcp-server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/waitrose-order-generator` with the actual path to your installation.

### Other MCP Clients

The server uses stdio transport and follows the standard MCP protocol. Configure your MCP client to run:

```bash
node /path/to/mcp-server.js
```

Make sure to set the `ANTHROPIC_API_KEY` environment variable.

## Usage Examples

Once configured in Claude Desktop, you can use natural language to interact with your shopping data:

**Generate a shopping list:**
> "Generate a shopping list for the next 7 days"

**View statistics:**
> "Show me my shopping statistics"

**Check history:**
> "What shopping lists have I generated?"

**Get specific list:**
> "Show me the details of shopping list #3"

## Development

### Testing the MCP Server

You can test the MCP server directly:

```bash
# Start the server (it listens on stdio)
node mcp-server.js

# The server will wait for MCP protocol messages on stdin
```

For easier testing, use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node mcp-server.js
```

### Tool Definitions

The server exposes tools with complete JSON schema validation. See `mcp-server.js` for the full tool definitions.

## Architecture

```
Claude Desktop (or other MCP client)
    ↓ (MCP Protocol via stdio)
MCP Server (mcp-server.js)
    ↓ (imports)
Core Modules (database.js, analyzer.js, claude-client.js)
    ↓
SQLite Database (local) + Claude API (remote)
```

### Privacy

All order data stays local:
- Raw orders, dates, and details stored in SQLite only
- Only anonymized pattern summaries sent to Claude API
- No personally identifiable information leaves your machine

## Troubleshooting

### "No orders in database"
Run `node cli.js stats` to check your order count. You need at least 3 orders for pattern analysis.

### "ANTHROPIC_API_KEY not found"
Make sure you've set the API key in your MCP server configuration (either in `.env` or in the Claude Desktop config).

### Server not appearing in Claude Desktop
1. Check that the path in `claude_desktop_config.json` is absolute (not relative)
2. Restart Claude Desktop after changing the config
3. Check Claude Desktop's logs for errors

### "Module not found" errors
Run `npm install` to ensure all dependencies are installed, including `@modelcontextprotocol/sdk`.

## Phase 1 Limitations

This is Phase 1 of the MCP server. Current limitations:

- ✅ Read-only access to order data and statistics
- ✅ Generate shopping lists with AI
- ✅ View shopping list history
- ❌ Scraping new orders (use CLI for now)
- ❌ Basket automation (requires Chrome integration)

Future phases will add order scraping and basket automation capabilities.

## Support

For issues and questions:
- Check the main [README.md](./README.md) for CLI usage
- See [CLAUDE.md](./CLAUDE.md) for development guidelines
- Report bugs on GitHub

## License

MIT
