-- BuildTrack API Database Optimisation Migration
-- Generated: 2026-05-10
-- Database: buildtrack_api

-- =============================================================================
-- 1. TRIGGER FUNCTION: Auto-update updated_at on row modification
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_safety_incidents_updated_at
  BEFORE UPDATE ON safety_incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. TRIGGER: Auto-populate tasks.completed_at when status changes to completed
-- =============================================================================

CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_completed_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_completed_at();

-- =============================================================================
-- 3. CRITICAL INDEXES (performance)
-- =============================================================================

-- Token lookups during refresh (called frequently)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_lookup
  ON refresh_tokens(token);

-- Token expiry for cleanup jobs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_expiry
  ON refresh_tokens(expires_at)
  WHERE expires_at < NOW();

-- Unread notifications (dashboard query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, created_at DESC)
  WHERE read = false;

-- Overdue tasks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_overdue
  ON tasks(project_id, due_date)
  WHERE status != 'completed' AND due_date IS NOT NULL;

-- Active projects for dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_active
  ON projects(user_id, status)
  WHERE status IN ('active', 'planning');

-- Open safety incidents
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incidents_open
  ON safety_incidents(project_id, severity)
  WHERE status IN ('open', 'investigating');

-- Recent activity feed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_recent
  ON activity_logs(user_id, created_at DESC);

-- Entity history queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_entity
  ON activity_logs(entity_type, entity_id, created_at DESC);

-- Activity by action type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_action
  ON activity_logs(action, created_at DESC);

-- Worker availability
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workers_available
  ON workers(user_id, status)
  WHERE status = 'active';

-- Inspection status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspections_status
  ON inspections(project_id, status);

-- Task status for dashboard counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_status
  ON tasks(project_id, status);

-- =============================================================================
-- 4. CLEANUP: Remove expired refresh tokens
-- =============================================================================

DELETE FROM refresh_tokens WHERE expires_at < NOW();

-- =============================================================================
-- 5. VERIFICATION
-- =============================================================================

-- Check trigger creation
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'update_%_updated_at';

-- Check indexes
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- Check expired token cleanup
-- SELECT COUNT(*) FROM refresh_tokens WHERE expires_at < NOW();
