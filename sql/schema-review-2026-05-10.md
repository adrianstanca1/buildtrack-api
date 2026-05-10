# BuildTrack API — Database Design Analysis Report
*Generated: 2026-05-10*

---

## 1. Schema Overview

| Table | Rows | Size | Purpose |
|-------|------|------|---------|
| users | 15 | 48 KB | Auth & billing |
| projects | 2 | 48 KB | Construction projects |
| tasks | 5 | 64 KB | Project tasks |
| workers | 4 | 48 KB | Workers |
| safety_incidents | 0 | 24 KB | Safety reports |
| inspections | 0 | 24 KB | Quality inspections |
| notifications | 0 | 24 KB | User notifications |
| activity_logs | 0 | 32 KB | Audit trail |
| project_workers | 0 | 8 KB | Many-to-many junction |
| refresh_tokens | 29 | 80 KB | Session tokens |

---

## 2. Normalisation Assessment

### ✅ Third Normal Form (3NF) Achieved

All tables have:
- **Atomic columns** — no composite values stored as strings
- **No transitive dependencies** — all non-key columns depend only on the PK
- **Proper foreign keys** — all relationships enforced at DB level
- **UUID primary keys** — `gen_random_uuid()`, collision-resistant
- **CHECK constraints** — enum validation at DB level (excellent)
- **JSONB for flexible arrays** — certifications, witnesses, photos, findings

### Strengths

| Aspect | Implementation | Grade |
|--------|---------------|-------|
| Enum constraints | `CHECK (role IN (...))` on every enum column | A+ |
| Cascade rules | Thoughtful DELETE behaviour (CASCADE vs SET NULL) | A+ |
| JSONB usage | Arrays stored as JSONB, not text | A |
| Composite PK | `project_workers` uses (project_id, worker_id) | A+ |
| Nullable FKs | `safety_incidents.project_id` is nullable (orphan handling) | A |

---

## 3. Missing Indexes (Performance)

### Critical — Add These Now

```sql
-- For "unread notifications" queries (very common)
CREATE INDEX CONCURRENTLY idx_notifications_unread 
  ON notifications(user_id, created_at DESC) 
  WHERE read = false;

-- For token lookups during refresh (called on every token refresh)
CREATE INDEX CONCURRENTLY idx_refresh_tokens_lookup 
  ON refresh_tokens(token);

-- For token cleanup jobs (remove expired tokens)
CREATE INDEX CONCURRENTLY idx_refresh_tokens_expiry 
  ON refresh_tokens(expires_at) 
  WHERE expires_at < NOW();

-- For "overdue tasks" queries
CREATE INDEX CONCURRENTLY idx_tasks_overdue 
  ON tasks(project_id, due_date) 
  WHERE status != 'completed' AND due_date IS NOT NULL;
```

### High Priority

```sql
-- For filtering active projects
CREATE INDEX CONCURRENTLY idx_projects_active 
  ON projects(user_id, status) 
  WHERE status IN ('active', 'planning');

-- For dashboard "tasks by status" counts
CREATE INDEX CONCURRENTLY idx_tasks_status 
  ON tasks(project_id, status);

-- For safety incident dashboards
CREATE INDEX CONCURRENTLY idx_incidents_open 
  ON safety_incidents(project_id, severity) 
  WHERE status IN ('open', 'investigating');

-- For inspection status filtering
CREATE INDEX CONCURRENTLY idx_inspections_status 
  ON inspections(project_id, status);

-- For worker availability
CREATE INDEX CONCURRENTLY idx_workers_available 
  ON workers(user_id, status) 
  WHERE status = 'active';

-- For activity feed (recent events)
CREATE INDEX CONCURRENTLY idx_activity_recent 
  ON activity_logs(user_id, created_at DESC);

-- For entity history queries
CREATE INDEX CONCURRENTLY idx_activity_entity 
  ON activity_logs(entity_type, entity_id, created_at DESC);
```

### Medium Priority

```sql
-- For date-range queries on projects
CREATE INDEX CONCURRENTLY idx_projects_dates 
  ON projects(start_date, end_date);

-- For full-text search on project names
CREATE INDEX CONCURRENTLY idx_projects_search 
  ON projects USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- For searching workers by name
CREATE INDEX CONCURRENTLY idx_workers_name 
  ON workers USING gin(to_tsvector('english', name));
```

---

## 4. Schema Issues Found

### Issue 1: `updated_at` Does Not Auto-Update
**Severity: MEDIUM**

`updated_at` has `DEFAULT now()` but does not auto-update on row modification.

**Fix:** Add trigger or use `CURRENT_TIMESTAMP` in UPDATE queries.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Repeat for: projects, tasks, workers, safety_incidents, inspections
```

---

### Issue 2: `notifications` Table Missing `read_at`
**Severity: LOW**

Current design: `read BOOLEAN DEFAULT false`

Problem: Cannot track WHEN a notification was read.

**Fix:**
```sql
ALTER TABLE notifications 
  ADD COLUMN read_at TIMESTAMP,
  DROP COLUMN read;  -- Or keep both for backwards compat

-- If keeping both, add trigger:
CREATE TRIGGER set_read_at BEFORE UPDATE ON notifications
  FOR EACH ROW WHEN (OLD.read = false AND NEW.read = true)
  EXECUTE FUNCTION update_read_at_column();
```

---

### Issue 3: `activity_logs` Missing `action` Index
**Severity: LOW**

Filtering by action type ("created", "updated", "deleted") is common for audit queries.

**Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_activity_action 
  ON activity_logs(action, created_at DESC);
```

---

### Issue 4: `tasks` Missing `completed_at` Logic
**Severity: LOW**

`completed_at` is nullable but not auto-populated when status changes to 'completed'.

**Fix:** Add trigger:
```sql
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_completed_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();
```

---

### Issue 5: No `deleted_at` Soft Deletes
**Severity: LOW (Design Decision)**

All tables use `ON DELETE CASCADE`. No soft-delete pattern.

**Impact:** Accidental deletion is permanent. No recovery possible.

**Recommendation:** Consider adding `deleted_at` to critical tables:
```sql
ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX CONCURRENTLY idx_projects_not_deleted 
  ON projects(id) WHERE deleted_at IS NULL;
-- Update all queries to include: WHERE deleted_at IS NULL
```

---

### Issue 6: `users.subscription_status` Has 5 Values But Only 3 Are Meaningful
**Severity: LOW**

Values: `active, inactive, past_due, cancelled, trialing`

Problem: `past_due` and `cancelled` are billing states that should be tracked separately, not mixed with status.

**Recommendation:** Add `billing_status` column and simplify `subscription_status` to `active/inactive`.

---

### Issue 7: `projects.budget/spent` as NUMERIC Without Currency
**Severity: LOW**

No currency column. Multi-currency support would require schema changes later.

**Recommendation:** Add `currency VARCHAR(3) DEFAULT 'USD'` if internationalisation is planned.

---

## 5. Row Count Analysis

| Table | Rows | Assessment |
|-------|------|------------|
| refresh_tokens | 29 | ⚠️ High — cleanup job needed (expired tokens accumulate) |
| users | 15 | ✅ Normal |
| tasks | 5 | ✅ Normal |
| workers | 4 | ✅ Normal |
| projects | 2 | ✅ Normal |
| Others | 0 | ✅ Empty (new feature tables) |

**Action:** `refresh_tokens` has 29 rows. All valid? Check with:
```sql
SELECT COUNT(*) FROM refresh_tokens WHERE expires_at < NOW();
```

If > 0, run cleanup:
```sql
DELETE FROM refresh_tokens WHERE expires_at < NOW();
```

---

## 6. Vacuum Status

All tables show `last_vacuum = null` and `last_autovacuum = null`.

**Assessment:** Tables are tiny (<100 rows), autovacuum may not have triggered yet.

**Action:** Not urgent now, but monitor as row counts grow.

---

## 7. Foreign Key Cascade Rules Review

| Parent | Child | On Delete | Assessment |
|--------|-------|-----------|------------|
| users | projects | CASCADE | ✅ OK — user's projects deleted with account |
| users | tasks | — | ⚠️ tasks.assigned_to SET NULL (not CASCADE) — OK, preserves task history |
| users | workers | CASCADE | ✅ OK |
| users | notifications | CASCADE | ✅ OK |
| users | refresh_tokens | CASCADE | ✅ OK |
| users | activity_logs | SET NULL | ✅ OK — preserves audit trail |
| projects | tasks | CASCADE | ✅ OK |
| projects | safety_incidents | SET NULL | ⚠️ Incident preserved but orphaned — consider keeping FK or archiving |
| projects | inspections | SET NULL | ⚠️ Same as above |
| projects | activity_logs | SET NULL | ✅ OK — audit trail preserved |

---

## 8. Recommended SQL Migration

```sql
-- 1. Fix updated_at auto-update for all tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON safety_incidents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Add critical indexes
CREATE INDEX CONCURRENTLY idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read = false;
CREATE INDEX CONCURRENTLY idx_refresh_tokens_lookup ON refresh_tokens(token);
CREATE INDEX CONCURRENTLY idx_refresh_tokens_expiry ON refresh_tokens(expires_at) WHERE expires_at < NOW();
CREATE INDEX CONCURRENTLY idx_tasks_overdue ON tasks(project_id, due_date) WHERE status != 'completed' AND due_date IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_projects_active ON projects(user_id, status) WHERE status IN ('active', 'planning');
CREATE INDEX CONCURRENTLY idx_incidents_open ON safety_incidents(project_id, severity) WHERE status IN ('open', 'investigating');
CREATE INDEX CONCURRENTLY idx_activity_recent ON activity_logs(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_activity_entity ON activity_logs(entity_type, entity_id, created_at DESC);

-- 3. Add task completed_at trigger
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_completed_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();

-- 4. Clean expired refresh tokens
DELETE FROM refresh_tokens WHERE expires_at < NOW();
```

---

## 9. Overall Grade

| Category | Grade | Notes |
|----------|-------|-------|
| Normalisation | A+ | 3NF, proper constraints |
| Indexing | B+ | Good FK indexes, missing query-specific indexes |
| Data Types | A | UUID PKs, JSONB for arrays, proper NUMERIC precision |
| Constraints | A+ | CHECK constraints on all enums |
| Cascade Rules | A | Thoughtful DELETE behaviour |
| Audit Trail | B | activity_logs present, but missing trigger-based updated_at |
| Soft Deletes | C | Not implemented (design decision) |
| Maintenance | B+ | Needs index additions, no vacuum issues yet |

**Overall: A-**

Strong schema foundation. Add the recommended indexes and triggers for production readiness.
