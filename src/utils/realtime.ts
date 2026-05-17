// Reusable emitter for entity mutation events.
//
// Server-side (src/server.ts) exposes `(global as any).io` after Socket.IO
// initialises; route handlers call `emitEntityEvent('defect', 'updated', row)`
// to broadcast to the row's project room.
//
// Wrapped in try/catch because:
// 1. The io global may be undefined if the router is imported in a unit-test
//    setup that doesn't boot the HTTP server.
// 2. We never want a missed emit to fail the HTTP response — broadcasts are
//    best-effort, never authoritative.

type EntityName =
  | 'task'
  | 'defect'
  | 'rfi'
  | 'daily-report'
  | 'invoice'
  | 'submittal'
  | 'punch-item'
  | 'drawing'
  | 'permit';

type Verb = 'created' | 'updated' | 'deleted' | 'completed' | 'closed' | 'answered';

/**
 * Broadcast an event to the project room of a row.
 *
 * Event name format: `<entity>-<verb>` (e.g. 'task-created', 'rfi-answered').
 * Payload: `{ type, <entityKey>, at }` where entityKey is the entity name
 * (e.g. for entity='task' the payload key is `task`). This matches the
 * shape the buildtrack-web client expects in `src/lib/realtime.ts`.
 */
export function emitEntityEvent(
  entity: EntityName,
  verb: Verb,
  row: Record<string, any> | null | undefined,
): void {
  try {
    if (!row) return;
    const io = (global as any).io;
    if (!io) return;
    const projectId = row.project_id ?? row.projectId;
    if (!projectId) return;
    const eventName = `${entity}-${verb}`;
    io.to(`project:${projectId}`).emit(eventName, {
      type: eventName,
      [entity.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())]: row,
      at: new Date().toISOString(),
    });
  } catch {
    // Best-effort broadcast — swallow.
  }
}
