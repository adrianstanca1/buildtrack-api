import { query } from '../config/database.js';

export interface RiskSignal {
  type: 'delay' | 'missing_manpower' | 'safety' | 'incomplete' | 'weather_alert';
  severity: 'low' | 'medium' | 'high';
  message: string;
  suggestedAction: string;
  autoCreate?: {
    type: 'rfi' | 'issue' | 'change_event' | 'safety_incident';
    title: string;
    description: string;
  };
}

/**
 * Analyse a daily report for risk signals and suggest actions.
 */
export async function analyseDailyReportForRisk(
  projectId: string,
  reportData: {
    workCompleted?: string;
    issuesDelays?: string;
    safetyObservations?: string;
    workersOnSite?: number;
    weather?: string;
  }
): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];

  // Signal 1: Delay mentioned
  const delayKeywords = ['delay', 'delayed', 'behind schedule', 'late', 'postponed', 'waiting', 'hold up', 'bottleneck'];
  const combinedText = `${reportData.workCompleted || ''} ${reportData.issuesDelays || ''}`.toLowerCase();

  if (delayKeywords.some((k) => combinedText.includes(k))) {
    signals.push({
      type: 'delay',
      severity: 'high',
      message: 'Daily log mentions a delay. Consider documenting the cause.',
      suggestedAction: 'Create an RFI or issue to track the delay and protect your timeline.',
      autoCreate: {
        type: 'issue',
        title: 'Delay noted in daily log',
        description: reportData.issuesDelays || 'Delay mentioned in daily report',
      },
    });
  }

  // Signal 2: Missing manpower compared to typical
  if (reportData.workersOnSite !== undefined && reportData.workersOnSite === 0) {
    signals.push({
      type: 'missing_manpower',
      severity: 'medium',
      message: 'No workers reported on site. Verify if this is accurate.',
      suggestedAction: 'Confirm with the foreman and document any stand-down reason.',
    });
  }

  // Signal 3: Safety observation
  const safetyKeywords = ['unsafe', 'hazard', 'near miss', 'incident', 'injury', 'ppe', 'fall', 'trip'];
  if (safetyKeywords.some((k) => (reportData.safetyObservations || '').toLowerCase().includes(k))) {
    signals.push({
      type: 'safety',
      severity: 'high',
      message: 'Safety concern noted in daily log.',
      suggestedAction: 'Create a formal safety incident or observation record.',
      autoCreate: {
        type: 'safety_incident',
        title: 'Safety observation from daily log',
        description: reportData.safetyObservations || '',
      },
    });
  }

  // Signal 4: Incomplete log check
  const { rows } = await query(
    `SELECT COUNT(*) as count FROM daily_reports
     WHERE project_id = $1 AND report_date >= CURRENT_DATE - INTERVAL '3 days'`,
    [projectId]
  );
  const recentCount = parseInt(rows[0].count);
  if (recentCount < 2) {
    signals.push({
      type: 'incomplete',
      severity: 'medium',
      message: `Only ${recentCount} daily report(s) in the last 3 days.`,
      suggestedAction: 'Ensure daily logs are submitted consistently for audit protection.',
    });
  }

  // Signal 5: Weather alert
  const weatherKeywords = ['storm', 'flood', 'snow', 'high wind', 'extreme heat', 'freezing'];
  if (weatherKeywords.some((k) => (reportData.weather || '').toLowerCase().includes(k))) {
    signals.push({
      type: 'weather_alert',
      severity: 'medium',
      message: 'Severe weather reported. Consider impact on schedule and safety.',
      suggestedAction: 'Document weather-related delays and review safety procedures.',
    });
  }

  return signals;
}

/**
 * Check for projects missing daily logs and return alerts.
 */
export async function checkMissingDailyLogs(userId: string): Promise<
  Array<{ projectId: string; projectName: string; daysMissing: number }>
> {
  const { rows } = await query(
    `SELECT
      p.id,
      p.name,
      CURRENT_DATE - MAX(dr.report_date) as days_missing
     FROM projects p
     LEFT JOIN daily_reports dr ON dr.project_id = p.id
     WHERE p.user_id = $1 AND p.status = 'active'
     GROUP BY p.id, p.name
     HAVING MAX(dr.report_date) IS NULL OR MAX(dr.report_date) < CURRENT_DATE - INTERVAL '2 days'
     ORDER BY days_missing DESC`,
    [userId]
  );

  return rows.map((r) => ({
    projectId: r.id,
    projectName: r.name,
    daysMissing: parseInt(r.days_missing) || 999,
  }));
}
