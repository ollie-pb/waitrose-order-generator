---
status: complete
priority: p2
issue_id: "008"
tags: [database, data-integrity, bug]
dependencies: []
---

# Fix Sync Metadata Initialization CHECK Constraint Violation

## Problem Statement

**DATA INTEGRITY BUG**: Initial sync_metadata INSERT uses 'not_started' status which violates the CHECK constraint, causing silent initialization failure.

**Location:** `src/database.js:64-67`

**Current Code:**
```sql
INSERT OR IGNORE INTO sync_metadata
(key, last_sync_time, last_sync_timestamp, order_count_at_sync, status)
VALUES ('waitrose_orders', NULL, 0, 0, 'not_started');  -- Invalid!

-- CHECK constraint only allows: 'success', 'partial', 'failed'
```

**Problem:** 'not_started' is NOT in CHECK constraint → row rejected → metadata never initialized → detection breaks.

**Identified by:** Data Integrity Guardian Agent

## Proposed Solutions

### Option 1: Use Valid Status (Recommended)

```sql
INSERT OR IGNORE INTO sync_metadata
VALUES ('waitrose_orders', NULL, 0, 0, 'success');  -- Use valid status
```

**Effort:** 2 minutes, **Risk:** None

### Option 2: Update CHECK Constraint

Add 'not_started' to allowed values.

**Effort:** 5 minutes, **Risk:** Low

## Recommended Action

Use Option 1: Change 'not_started' → 'success' in initialization. Simplest fix, no migration needed.

## Acceptance Criteria

- [ ] Initial INSERT uses valid status value
- [ ] Row successfully inserted on first run
- [ ] `getLastSyncTime()` returns initialized data
- [ ] Detection workflow works on fresh database

## Work Log

### 2026-01-07 - Fix Implemented

**By:** Claude Code

**Actions:**
- Changed initialization status from 'not_started' to 'success' in database.js:67
- Verified CHECK constraint allows 'success' value (line 61)
- Tested with `node cli.js detect` - works correctly

**Results:**
- Metadata initialization now succeeds on fresh database
- No constraint violation
- `getLastSyncTime()` returns initialized data correctly
- Detection workflow works on fresh database

**Learnings:**
- Always verify values match CHECK constraints
- SQL INSERT OR IGNORE can fail silently with constraint violations
- Trivial 1-line fix had significant impact on first-run experience

## Resources

- **File:** `src/database.js:64-67`
- **CHECK constraint:** Line 61
