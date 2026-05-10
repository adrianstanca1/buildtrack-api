import { Request, Response, NextFunction } from 'express';
import { createNotification, notifyProjectMembers, notifyBallInCourt } from '../utils/notifications.js';

/**
 * Middleware that sends notifications after successful mutations.
 * Attach to routes that should trigger notifications.
 */
export function notifyOnCreate(
  entityType: 'rfi' | 'submittal' | 'drawing' | 'defect' | 'daily-report',
  titleField: string = 'title',
  projectIdField: string = 'projectId'
) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function(body: any) {
      // Only notify on success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = (res.req as any).user?.id;
        const projectId = body?.data?.[projectIdField] || body?.data?.project_id;
        const entityId = body?.data?.id;
        const title = body?.data?.[titleField] || body?.data?.subject || body?.data?.submittal_number || entityId?.substring(0, 8);

        if (userId && projectId && entityId) {
          // Fire-and-forget notification
          notifyProjectMembers(projectId, userId, {
            title: `New ${entityType} created`,
            body: `${title}`,
            type: entityType === 'daily-report' ? 'daily_report' : entityType === 'rfi' ? 'rfi' : entityType === 'submittal' ? 'submittal' : entityType === 'defect' ? 'punch' : 'drawing',
            relatedId: entityId,
          }).catch(console.error);
        }
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware that notifies on status change (ball-in-court).
 */
export function notifyOnStatusChange(
  entityType: 'rfi' | 'submittal'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function(body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.data) {
        const newStatus = body.data.status;
        const ballInCourt = body.data.ball_in_court || body.data.ballInCourt;
        const projectId = body.data.project_id || body.data.projectId;
        const entityId = body.data.id;
        const title = body.data.title || body.data.subject || body.data.submittal_number;

        // If status changed to something that implies ball-in-court change
        if (ballInCourt && projectId && entityId && title) {
          notifyBallInCourt(
            entityType,
            entityId,
            projectId,
            ballInCourt,
            null, // previous owner unknown in this context
            title
          ).catch(console.error);
        }
      }
      return originalJson(body);
    };

    next();
  };
}
