# feat: Waitrose Basket Automation via Claude in Chrome

## Overview

Integrate Waitrose basket automation directly into the `generate` command workflow. After displaying AI-generated shopping list recommendations, users can choose to automatically populate their Waitrose basket with one click. This eliminates manual search-and-add steps and creates a seamless flow from analysis to checkout.

**Key Decision**: Streamlined single-flow approach with review happening on Waitrose site, not in CLI.

## Problem Statement

Users currently generate intelligent shopping lists via `node cli.js generate`, but must manually:
1. Open Waitrose website
2. Search for each item (often 10-20 products)
3. Add items to basket individually
4. Verify quantities

This is time-consuming (5-10 minutes) and error-prone, reducing the value proposition of AI-generated recommendations.

## Proposed Solution

### MVP: Integrated Basket Automation

Extend the existing `generate` command with basket automation:

**User Flow**:
```bash
# User generates list
node cli.js generate --days 7

# CLI displays recommendations:
# ✓ Generated shopping list for 7 days (10 items)
#
# Regular Items (appear in 40%+ of orders):
#   1. Organic Milk Semi-Skimmed 2L (qty: 2)
#   2. Bananas (qty: 1)
#   ...
#
# What would you like to do?
# → Send to Waitrose basket
# → Regenerate list
# → Save and exit

# User selects "Send to Waitrose basket"

# Automation runs (no further confirmations):
# 🛒 Opening Waitrose...
# 🔐 Please log in and press Enter...
# ⠋ Adding 1/10: Organic Milk... ✓
# ⠙ Adding 2/10: Bananas... ✓
# ...
# ✓ Added 8/10 items (2 unavailable)
#
# 🌐 Navigating to basket page...
# Review your basket and checkout when ready

# Browser shows Waitrose basket page
# User reviews, makes manual edits if needed
# User completes checkout
# Next 'scrape' captures actual order for improved recommendations
```

**Key Principles**:
- **One confirmation point**: After viewing list, user chooses action
- **No intermediate validation**: Direct automation from confirmation to basket
- **Review on Waitrose**: User verifies/edits in native Waitrose UI (better UX)
- **Closed loop**: Edits captured in next scrape, improving future recommendations

## Technical Approach

### Architecture

**New Module**: `src/basket-automator.js`
- Export `populateBasket(chromeTools, items, options)`
- Pure business logic, no direct CLI I/O
- Returns structured results: `{ added: [], failed: [] }`

**CLI Integration**: Modify `generate` command in `cli.js`
```javascript
// After generating recommendations...
const recommendations = await generateShoppingList(patternSummary, { daysCoverage });

// Display formatted list
console.log(formatShoppingList(recommendations));

// Prompt user for action
const action = await promptAction(['Send to Waitrose basket', 'Regenerate', 'Save and exit']);

if (action === 'Send to Waitrose basket') {
  // Save list first (so we have an ID to reference)
  const listId = saveShoppingList(db, daysCoverage, recommendations);

  // Initialize Chrome tools (from MCP context)
  const chromeTools = /* MCP tools available in CLI context */;

  // Run automation
  const results = await populateBasket(chromeTools, recommendations, { listId });

  // Display summary
  console.log(`✓ Added ${results.added.length}/${recommendations.length} items`);
  console.log('Review your basket and checkout when ready');
}
```

### Chrome MCP Tools Usage

**Tool Chain (Simplified)**:
1. `tabs_context_mcp({ createIfEmpty: true })` - Initialize session
2. `tabs_create_mcp()` - Create clean tab (or reuse existing)
3. `navigate({ tabId, url })` - Go to Waitrose
4. `find({ tabId, query })` - Locate search box, add buttons
5. `type({ tabId, ref, text, submit })` - Search products
6. `click({ tabId, ref, element })` - Add to basket
7. `wait_for({ text })` - Wait for confirmations
8. `navigate({ tabId, url: 'basket' })` - Navigate to basket page (final step)

**No `update_plan()` needed**: User already confirmed action in CLI prompt.

### Data Flow

```
User runs: node cli.js generate --days 7
  ↓
Database query + Pattern analysis
  ↓
Claude API generates recommendations
  ↓
Display formatted list in CLI
  ↓
[USER CONFIRMATION POINT]
User selects: "Send to Waitrose basket"
  ↓
Save list to database (get listId)
  ↓
Initialize Chrome MCP tools
  ↓
For each item:
  - Search product
  - Click "Add to basket"
  - Handle errors (continue on failure)
  ↓
Navigate to basket page
  ↓
Display summary in CLI
Exit (browser stays open)
  ↓
[USER REVIEWS ON WAITROSE SITE]
User verifies/edits basket, checks out
  ↓
[NEXT SCRAPE]
Actual order captured, improves future recommendations
```

### Item Search & Add Algorithm

```javascript
async function addItemToBasket(chromeTools, tabId, productName, quantity) {
  try {
    // 1. Normalize search term
    const searchTerm = normalizeProductName(productName);
    // "Waitrose Organic Milk Semi-Skimmed 2L" → "milk semi skimmed"

    // 2. Search
    const searchBox = await chromeTools.find({ tabId, query: 'search input box' });
    await chromeTools.type({
      tabId,
      ref: searchBox[0].ref,
      element: 'search input',
      text: searchTerm,
      submit: true
    });

    // 3. Wait for results
    await chromeTools.wait_for({ text: 'results' });

    // 4. Find first matching product
    const addButtons = await chromeTools.find({
      tabId,
      query: 'add to basket button'
    });

    if (addButtons.length === 0) {
      return { item: productName, status: 'not_found' };
    }

    // 5. Set quantity if needed (default is usually 1)
    if (quantity > 1) {
      const qtyInput = await chromeTools.find({
        tabId,
        query: 'quantity input'
      });
      await chromeTools.type({
        tabId,
        ref: qtyInput[0].ref,
        element: 'quantity input',
        text: quantity.toString()
      });
    }

    // 6. Click add to basket
    await chromeTools.click({
      tabId,
      ref: addButtons[0].ref,
      element: 'add to basket button'
    });

    // 7. Wait for confirmation
    await chromeTools.wait_for({ text: 'added to basket', timeout: 3000 });

    // 8. Small delay to avoid rate limiting
    await sleep(500);

    return { item: productName, quantity, status: 'added' };

  } catch (error) {
    return {
      item: productName,
      status: error.message.includes('not found') ? 'not_found' : 'failed',
      error: error.message
    };
  }
}
```

**Matching Strategy**:
- Use **first result** from search (trust Waitrose's search ranking)
- No complex scoring needed - Waitrose search is already optimized
- If search returns no results → mark as `not_found`, continue
- If add fails → mark as `failed`, continue

**Why this is simpler**:
- No manual match scoring (60% vs. 80% complexity)
- Trust Waitrose's search algorithm (they know their products best)
- User reviews on Waitrose site anyway, can fix mistakes there
- Closed-loop feedback: wrong matches → user edits → next scrape captures truth

### Authentication Flow

Reuse existing pattern from `src/chrome-scraper.js`:

```javascript
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
```

**Session handling**: No persistence in MVP. User logs in manually each session. Future enhancement: save session to `data/waitrose-session.json`.

### Error Handling Strategy

**Per-Item Retry (2 attempts)**:
```javascript
async function addItemWithRetry(chromeTools, tabId, item, maxRetries = 2) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await addItemToBasket(chromeTools, tabId, item.item, item.quantity);
    } catch (error) {
      if (attempt === maxRetries - 1) {
        return { item: item.item, status: 'failed', error: error.message };
      }
      await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s
    }
  }
}
```

**Error Categories**:
- `added` - Successfully added to basket
- `not_found` - Search returned no results
- `failed` - Network error, timeout, or unexpected DOM state

**Behavior**:
- Continue on failure (don't abort entire run)
- Collect results, display summary at end
- Navigate to basket page regardless of failure count

### Basket State Management

**MVP: Append Mode (No Basket Detection)**

- Does NOT check existing basket contents
- Does NOT clear basket before starting
- Simply adds all items to current basket
- User can manually clear basket on Waitrose site before running command if desired

**Why this is the right MVP choice**:
- Significantly simpler (no basket parsing logic)
- Zero risk of deleting user's manual additions
- User has full control via Waitrose UI
- Any issues are immediately visible on basket page (user reviews anyway)

## Implementation Phases

### Phase 1: Core MVP (First PR)

**Files to Create**:
- `src/basket-automator.js` - Main automation logic

**Files to Modify**:
- `cli.js` - Extend `generate` command with basket automation option
- `src/utils.js` - Add action prompt helper (reuse existing patterns)
- `README.md` - Document new workflow

**MVP User Flow**:
```bash
# Standard workflow with automation option
node cli.js generate --days 7
# → Displays list
# → Prompts: "Send to basket, Regenerate, or Exit?"
# → User chooses "Send to basket"
# → Automation runs → Basket page shown

# Can still save without automating
node cli.js generate --days 7
# → User chooses "Save and exit"
# → List saved to database, no browser automation
```

**Success Criteria**:
- ✅ After generating list, user is prompted for action
- ✅ "Send to basket" option launches browser automation
- ✅ Can navigate to Waitrose and authenticate
- ✅ Searches for all items in list
- ✅ Adds available items to basket (continues on failures)
- ✅ Navigates to basket page after completion
- ✅ Displays simple summary: "Added X/Y items"
- ✅ Browser stays open for user review
- ✅ Handles authentication failures gracefully

**MVP Scope Exclusions** (for future):
- No basket clearing/replacement mode
- No complex match scoring (just use first result)
- No session state persistence
- No dry-run mode (can add later if needed)
- No separate `add-to-basket` command (fully integrated into `generate`)

### Phase 2: Enhanced Reliability

**New Capabilities**:
- Session expiry detection and re-auth mid-run
- Network timeout customization
- Better error messaging (categorize failures)
- Optional `--skip-basket` flag to disable automation

**Files to Modify**:
- `src/basket-automator.js` - Add session monitoring
- `cli.js` - Add `--skip-basket` flag

### Phase 3: Advanced Features

**New Capabilities**:
- Session persistence (`data/waitrose-session.json`)
- Basket clearing option (before adding items)
- Product variant preferences (organic vs. standard)
- Historical basket operation tracking in database

**Database Extension** (optional):
```sql
CREATE TABLE basket_operations (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  items_attempted INTEGER,
  items_added INTEGER,
  items_failed INTEGER,
  FOREIGN KEY (list_id) REFERENCES shopping_lists(id)
);
```

## Acceptance Criteria

### Functional Requirements

**Integrated Workflow**:
- [ ] After `generate` command displays list, user is prompted for action
- [ ] Action options: "Send to Waitrose basket", "Regenerate list", "Save and exit"
- [ ] Selecting "Send to basket" triggers automation
- [ ] List is saved to database before automation starts
- [ ] Automation proceeds without further prompts

**Browser Automation**:
- [ ] Opens Waitrose.com in Chrome tab via MCP tools
- [ ] Prompts for manual login if not authenticated
- [ ] Verifies login success before proceeding
- [ ] Searches for each product by normalized name
- [ ] Adds first matching product to basket
- [ ] Sets quantity correctly (>1 if specified)
- [ ] Continues to next item on failure (no abort)
- [ ] Navigates to basket page after processing all items

**Error Handling**:
- [ ] Retries failed operations 2x with exponential backoff
- [ ] Categorizes failures (not found, failed)
- [ ] Does not crash on network timeouts or DOM changes
- [ ] Continues processing even if some items fail

**Progress Feedback**:
- [ ] Updates progress per item: "Adding 3/10: Milk... ✓"
- [ ] Uses color coding (green=success, red=error)
- [ ] Shows simple summary at end: "Added 8/10 items"
- [ ] Displays message: "Review your basket and checkout when ready"

**Results Display**:
- [ ] Summary shows X/Y items added successfully
- [ ] Browser navigates to Waitrose basket page
- [ ] Browser stays open for user review
- [ ] CLI exits cleanly (user continues in browser)

### Non-Functional Requirements

**Performance**:
- [ ] Adds items at reasonable pace (~10 seconds per item)
- [ ] Includes 500ms delay between items to avoid rate limiting
- [ ] Does not trigger Waitrose bot detection

**Reliability**:
- [ ] Handles DOM changes gracefully (uses semantic selectors)
- [ ] Recovers from transient network failures (retries)
- [ ] Trusts Waitrose search ranking (first result strategy)

**Usability**:
- [ ] Clear progress indication via ora spinners
- [ ] Actionable error messages
- [ ] Seamless integration into existing `generate` command
- [ ] User reviews basket on Waitrose (natural workflow)

**Security**:
- [ ] Never stores user credentials
- [ ] No sensitive data logged to console/files
- [ ] Manual login only (no programmatic auth)

## Dependencies & Prerequisites

### External Dependencies
- **No new npm packages required** (uses existing Chrome MCP tools)
- Requires Chrome browser installed and running
- Requires active internet connection
- Requires Claude in Chrome MCP server running

### Data Prerequisites
- Database with order history (for pattern analysis)
- Waitrose account for login

### User Prerequisites
- User must manually log in during first automation
- User should be comfortable reviewing basket on Waitrose site

## Risks & Mitigations

**Risk 1: Wrong Product Additions**
- **Impact**: User orders incorrect items
- **Mitigation**: Use first search result (trust Waitrose search), user reviews basket on Waitrose site before checkout, closed-loop feedback via scraping captures corrections
- **Likelihood**: Medium (ambiguous names exist)
- **Acceptance**: User reviews basket anyway; wrong items easily corrected on Waitrose UI

**Risk 2: DOM Structure Changes**
- **Impact**: Automation breaks if Waitrose redesigns site
- **Mitigation**: Use semantic element finding (`find({ query: 'search input' })`), monitor for breakage, graceful degradation
- **Likelihood**: Medium (1-2x per year)

**Risk 3: Bot Detection**
- **Impact**: Waitrose blocks automation
- **Mitigation**: Use Chrome MCP (human-like interaction), add delays (500ms), realistic interaction patterns
- **Likelihood**: Low

**Risk 4: Session Expiry**
- **Impact**: Large lists fail mid-run
- **Mitigation**: Phase 2 feature (detect auth errors, re-login, resume)
- **Likelihood**: Low for MVP (most lists <20 items = <5 min)

## Success Metrics

**Adoption**:
- % of users who choose "Send to basket" option
- Frequency of use per active user

**Quality**:
- Success rate: Items added / Items attempted (target: ≥80%)
- User-reported wrong product additions (target: <10% - acceptable given review step)

**Performance**:
- Average time per item (target: <15 seconds)
- End-to-end time for 10-item list (target: <3 minutes)

**User Satisfaction**:
- GitHub issues filed for automation bugs
- User feedback sentiment

## Resolved Decisions (from Q1-Q5)

### Q1: Default List Selection ✅
- **Decision**: Use most recent list (auto-select), show which one in confirmation
- **Rationale**: Matches user expectation, streamlined UX

### Q2: Conflicting Options Handling ✅
- **Decision**: Error if both `--list-id` and `--days` specified
- **Rationale**: Forces explicit choice, prevents confusion
- **Note**: Not applicable to MVP (no separate command), but good pattern for future

### Q3: Item Match Confidence Threshold ✅
- **Decision**: Use first search result (no scoring)
- **Rationale**: Trust Waitrose search algorithm, user reviews basket anyway, simpler implementation
- **Note**: Original 60% threshold no longer needed

### Q4: Browser Lifecycle ✅
- **Decision**: Leave browser open after completion
- **Rationale**: User needs to review/checkout; closing would be disruptive

### Q5: Dry Run Behavior ✅
- **Decision**: No dry run in MVP (can add later if requested)
- **Rationale**: User sees list in CLI before choosing "Send to basket" (that's the preview)

## Future Enhancements (Post-MVP)

### Immediate Next Iteration
- `--skip-basket` flag to disable automation
- Session state persistence
- Better error categorization and reporting

### Medium-Term
- Basket clearing option (before adding items)
- Product variant preferences
- Resume-from-failure capability
- Investigate Waitrose API (if available)

### Long-Term
- Browser extension version with GUI
- Multi-store support (Tesco, Sainsbury's)
- Mobile app integration
- A/B testing of search strategies

## References & Research

### Internal References
- `cli.js:55-132` - Existing `generate` command structure
- `src/database.js:156` - `getShoppingList()` and `saveShoppingList()` functions
- `src/chrome-scraper.js:47` - Manual login pattern with `waitForEnter()`
- `src/utils.js` - Terminal formatting utilities (ora, chalk)
- `CLAUDE.md` - Project architecture and conventions

### External References
- Claude in Chrome MCP Tools Documentation
- Browser automation best practices
- E-commerce cart automation patterns

### Related Work
- PR #1 - New Order Detection (demonstrates Chrome MCP integration)
- `src/chrome-scraper.js` - Existing MCP tool usage patterns

### Architectural Decisions
- **Decision**: Integrate into `generate` command (not separate command)
  - **Rationale**: Streamlined UX, fewer steps, natural workflow
- **Decision**: Single confirmation point (no two-phase validation)
  - **Rationale**: User reviews on Waitrose site anyway; trust AI + search algorithm
- **Decision**: Use first search result (no match scoring)
  - **Rationale**: Waitrose search is optimized; user verifies basket; simpler code
- **Decision**: Append mode only (no basket detection)
  - **Rationale**: Safest approach, user has full control, zero risk of data loss

---

## Implementation Checklist

**Before Starting**:
- [x] Review and approve this plan
- [x] Resolve Q1-Q5 (all resolved above)
- [ ] Validate Chrome MCP tools available in CLI context
- [ ] Review existing `generate` command code

**During Implementation**:
- [ ] Create `src/basket-automator.js` with core logic
- [ ] Modify `cli.js` generate command to add action prompt
- [ ] Add basket automation flow after list display
- [ ] Implement authentication check
- [ ] Implement search and add loop
- [ ] Add navigation to basket page at end
- [ ] Test with real Waitrose account

**Before PR**:
- [ ] Update `README.md` with new workflow documentation
- [ ] Test on clean database (first-time user)
- [ ] Verify error handling (out of stock, not found, network)
- [ ] Confirm browser stays open at basket page
- [ ] Add inline comments explaining key steps

**Post-Merge**:
- [ ] Monitor GitHub issues for bug reports
- [ ] Collect user feedback on accuracy
- [ ] Track success rate metrics
- [ ] Plan Phase 2 based on real usage

---

**Plan Version**: 2.0 (Streamlined)
**Last Updated**: 2026-01-07
**Author**: AI Assistant (Claude Sonnet 4.5)
**Status**: Approved - Ready for Implementation
**Decisions**: Q1-Q5 resolved, user flow simplified and approved
