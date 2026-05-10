import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────

export type RecordType =
  | 'rfi'
  | 'submittal'
  | 'defect'
  | 'drawing'
  | 'task'
  | 'inspection'
  | 'permit'
  | 'safety_incident'
  | 'invoice'
  | 'timesheet'
  | 'daily_report'
  | 'team_member'
  | 'worker'
  | 'project';

export interface LinkRecord {
  id: string;
  source_type: RecordType;
  source_id: string;
  target_type: RecordType;
  target_id: string;
  relation: string;
  created_at: Date;
  created_by: string | null;
}

export interface LinkedRecord {
  id: string;
  type: RecordType;
  relation: string;
  direction: 'outbound' | 'inbound';
  created_at: Date;
  created_by: string | null;
  // Dynamic record data fetched from target table
  data?: Record<string, any>;
}

export interface ActivityNode {
  id: string;
  type: RecordType;
  data?: Record<string, any>;
  links: ActivityEdge[];
}

export interface ActivityEdge {
  target_id: string;
  target_type: RecordType;
  relation: string;
  direction: 'outbound' | 'inbound';
}

// ─── Core Link Operations ─────────────────────────────────────────────

/**
 * Create a bidirectional link between two records.
 * If a link already exists, it is returned without creating a duplicate.
 */
export async function linkRecord(
  sourceType: RecordType,
  sourceId: string,
  targetType: RecordType,
  targetId: string,
  relation: string = 'related',
  createdBy?: string
): Promise<LinkRecord> {
  // Prevent self-links
  if (sourceType === targetType && sourceId === targetId) {
    throw new Error('Cannot link a record to itself');
  }

  // Check for existing link (either direction)
  const existing = await query(
    `SELECT * FROM links
     WHERE (source_type = $1 AND source_id = $2 AND target_type = $3 AND target_id = $4)
        OR (source_type = $3 AND source_id = $4 AND target_type = $1 AND target_id = $2)
     LIMIT 1`,
    [sourceType, sourceId, targetType, targetId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0] as LinkRecord;
  }

  const id = uuidv4();
  const result = await query(
    `INSERT INTO links (id, source_type, source_id, target_type, target_id, relation, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [id, sourceType, sourceId, targetType, targetId, relation, createdBy || null]
  );

  return result.rows[0] as LinkRecord;
}

/**
 * Get all linked records for a given record (both inbound and outbound).
 */
export async function getLinkedRecords(
  recordType: RecordType,
  recordId: string
): Promise<LinkedRecord[]> {
  const result = await query(
    `SELECT
       id,
       source_type,
       source_id,
       target_type,
       target_id,
       relation,
       created_at,
       created_by
     FROM links
     WHERE (source_type = $1 AND source_id = $2)
        OR (target_type = $1 AND target_id = $2)
     ORDER BY created_at DESC`,
    [recordType, recordId]
  );

  return result.rows.map((row: any) => {
    const isOutbound = row.source_type === recordType && row.source_id === recordId;
    return {
      id: row.id,
      type: isOutbound ? row.target_type : row.source_type,
      relation: row.relation,
      direction: isOutbound ? ('outbound' as const) : ('inbound' as const),
      created_at: row.created_at,
      created_by: row.created_by,
    };
  });
}

/**
 * Remove a specific link by its ID.
 */
export async function unlinkRecord(linkId: string): Promise<void> {
  await query('DELETE FROM links WHERE id = $1', [linkId]);
}

/**
 * Remove all links connected to a record (useful on deletion).
 */
export async function unlinkAll(recordType: RecordType, recordId: string): Promise<void> {
  await query(
    `DELETE FROM links
     WHERE (source_type = $1 AND source_id = $2)
        OR (target_type = $1 AND target_id = $2)`,
    [recordType, recordId]
  );
}

/**
 * Get a graph of all related records up to 2 hops.
 * Returns a map of node_id -> ActivityNode for easy consumption.
 */
export async function getActivityGraph(
  recordType: RecordType,
  recordId: string
): Promise<Map<string, ActivityNode>> {
  const nodes = new Map<string, ActivityNode>();
  const visited = new Set<string>();
  const queue: Array<{ type: RecordType; id: string; depth: number }> = [
    { type: recordType, id: recordId, depth: 0 },
  ];

  // Helper to build node key
  const key = (type: RecordType, id: string) => `${type}:${id}`;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = key(current.type, current.id);

    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    // Ensure node exists
    if (!nodes.has(currentKey)) {
      nodes.set(currentKey, {
        id: current.id,
        type: current.type,
        links: [],
      });
    }

    if (current.depth >= 2) continue;

    // Fetch links for current node
    const linksResult = await query(
      `SELECT source_type, source_id, target_type, target_id, relation
       FROM links
       WHERE (source_type = $1 AND source_id = $2)
          OR (target_type = $1 AND target_id = $2)`,
      [current.type, current.id]
    );

    for (const row of linksResult.rows) {
      const isOutbound = row.source_type === current.type && row.source_id === current.id;
      const neighbourType: RecordType = isOutbound ? row.target_type : row.source_type;
      const neighbourId: string = isOutbound ? row.target_id : row.source_id;
      const neighbourKey = key(neighbourType, neighbourId);

      // Add edge to current node
      const currentNode = nodes.get(currentKey)!;
      currentNode.links.push({
        target_id: neighbourId,
        target_type: neighbourType,
        relation: row.relation,
        direction: isOutbound ? 'outbound' : 'inbound',
      });

      // Ensure neighbour node exists
      if (!nodes.has(neighbourKey)) {
        nodes.set(neighbourKey, {
          id: neighbourId,
          type: neighbourType,
          links: [],
        });
      }

      // Queue neighbour for next depth
      if (!visited.has(neighbourKey)) {
        queue.push({ type: neighbourType, id: neighbourId, depth: current.depth + 1 });
      }
    }
  }

  // Hydrate node data for all collected nodes
  await hydrateNodes(nodes);

  return nodes;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Fetch minimal data for each node type to enrich the graph.
 */
async function hydrateNodes(nodes: Map<string, ActivityNode>): Promise<void> {
  // Group by type for batched fetching
  const byType = new Map<RecordType, string[]>();
  for (const [nodeKey, node] of nodes) {
    if (!byType.has(node.type)) byType.set(node.type, []);
    byType.get(node.type)!.push(node.id);
  }

  for (const [type, ids] of byType) {
    const table = recordTypeToTable(type);
    if (!table) continue;

    try {
      // Use ANY for batched IN query
      const result = await query(
        `SELECT * FROM ${table} WHERE id = ANY($1::uuid[])`,
        [ids]
      );

      for (const row of result.rows) {
        const nodeKey = `${type}:${row.id}`;
        const node = nodes.get(nodeKey);
        if (node) {
          node.data = row;
        }
      }
    } catch (err) {
      // Table might not exist or schema mismatch — skip hydration for this type
      console.warn(`[Links] Hydration failed for ${type}:`, err);
    }
  }
}

/**
 * Map record types to their database table names.
 */
function recordTypeToTable(type: RecordType): string | null {
  const map: Record<RecordType, string> = {
    rfi: 'rfis',
    submittal: 'submittals',
    defect: 'defects',
    drawing: 'drawings',
    task: 'tasks',
    inspection: 'inspections',
    permit: 'permits',
    safety_incident: 'safety_incidents',
    invoice: 'invoices',
    timesheet: 'timesheets',
    daily_report: 'daily_reports',
    team_member: 'team_members',
    worker: 'workers',
    project: 'projects',
  };
  return map[type] || null;
}
