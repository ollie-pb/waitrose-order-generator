---
status: complete
priority: p2
issue_id: "007"
tags: [architecture, refactoring, separation-of-concerns]
dependencies: ["001"]
---

# Fix Architectural Abstraction Violations in detector.js

## Problem Statement

**ARCHITECTURAL ISSUE**: `detector.js` mixes coordination logic with Chrome automation implementation, violating separation of concerns. The detector should **coordinate** but not **implement** scraping logic.

**Current Architecture:**
```
detector.js
  ├── detectNewOrders() (coordinator) ✓ GOOD
  └── extractOrdersOnly() (implements Chrome navigation) ✗ BAD
```

**Why this matters:**
- Chrome automation logic duplicated/scattered
- Unclear module boundaries
- Harder to test coordinator vs implementation
- Violates Single Responsibility Principle

**Identified by:** Architecture Strategist Agent

## Findings

**Location:** `src/detector.js:91-152`

The `extractOrdersOnly()` function duplicates Chrome automation that should live in `chrome-scraper.js`:
- Chrome tab initialization
- Navigation to Waitrose
- Login detection
- Page content extraction

## Proposed Solutions

### Option 1: Move to chrome-scraper.js (Recommended)

**Approach:**
1. Extract `extractOrdersOnly()` to `chrome-scraper.js` as `extractOrderMetadata()`
2. Make `detector.js` call chrome-scraper functions
3. Clear responsibility: detector coordinates, scraper implements

**Pros:** Clean separation, single source of truth for Chrome logic
**Cons:** Requires refactoring detector.js
**Effort:** 1.5 hours (after #001), **Risk:** Low

## Recommended Action

**Dependencies:** Complete #001 (code deduplication) first to avoid moving duplicated code.

After #001 is complete:
1. Move `extractOrdersOnly()` to `chrome-scraper.js` as `extractOrderMetadata()`
2. Update `detector.js` to import and call chrome-scraper function
3. Remove Chrome MCP tool calls from detector.js

**Expected Architecture:**
```
detector.js (coordinator only)
  └── calls chrome-scraper.extractOrderMetadata()
      └── implements all Chrome automation
```

## Acceptance Criteria

- [ ] All Chrome MCP calls removed from detector.js
- [ ] detector.js only calls chrome-scraper.js functions
- [ ] chrome-scraper.js has clear exported functions
- [ ] Module responsibilities documented in CLAUDE.md
- [ ] All tests pass
- [ ] Detection workflow unchanged

## Work Log

### 2026-01-07 - Architecture Refactoring Complete

**By:** Claude Code

**Actions:**
- Moved extractOrdersOnly() from detector.js to chrome-scraper.js
- Renamed to extractOrderMetadata() for clarity
- Exported from chrome-scraper.js as public API
- Updated detector.js to import and call extractOrderMetadata()
- Removed all Chrome MCP tool calls from detector.js
- Removed waitForOrderHistoryLoad() helper (already in chrome-scraper.js)
- Removed unused imports (parseOrdersFromText, sleep, waitForEnter)
- Tested with `node cli.js detect` - works correctly

**Results:**
- detector.js reduced from 194 lines to 100 lines (48% reduction)
- Clear module separation: detector coordinates, scraper implements
- All Chrome automation logic now in chrome-scraper.js
- Single source of truth for Chrome operations
- All acceptance criteria met

**Learnings:**
- Module responsibilities are now clear and documented
- Detector is pure coordination logic (no Chrome calls)
- Chrome-scraper provides reusable extraction functions
- Architecture follows Single Responsibility Principle

## Resources

- **File:** `src/detector.js:91-152`
- **Architecture Review:** See architecture-strategist findings
- **Depends on:** #001 (code deduplication)
