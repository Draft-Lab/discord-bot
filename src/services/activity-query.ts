import type { ActivityHistory, UserSession } from "@/utils/session-manager";
import { getAllActivities } from "@/utils/session-manager";

export type Period = "day" | "week" | "month";

export interface ActivityGroup {
  activityName: string;
  activityType: number;
  totalDuration: number;
  totalSessions: number;
  activeUsers: string[];
  historySessions: ActivityHistory[];
  activeSessions: UserSession[];
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function formatDurationForDisplay(milliseconds: number): string {
  return formatDuration(milliseconds);
}

function getActivityTypeName(type: number): string {
  const types: Record<number, string> = {
    0: "Jogando",
    1: "Transmitindo",
    2: "Ouvindo",
    3: "Assistindo",
    4: "Competindo",
    5: "Personalizado",
  };
  return types[type] ?? `Tipo ${type}`;
}

export function getActivityTypeDisplay(type: number): string {
  return getActivityTypeName(type);
}

export async function getActivitiesByPeriod(period: Period): Promise<ActivityGroup[]> {
  const { active, history } = await getAllActivities(period);

  // Group by activity name and type
  const groupsMap = new Map<string, ActivityGroup>();

  // Process active sessions
  for (const session of active) {
    const key = `${session.activityType}:${session.activityName}`;
    let group = groupsMap.get(key);

    if (!group) {
      group = {
        activityName: session.activityName,
        activityType: session.activityType,
        totalDuration: 0,
        totalSessions: 0,
        activeUsers: [],
        historySessions: [],
        activeSessions: [],
      };
      groupsMap.set(key, group);
    }

    group.activeSessions.push(session);
    if (!group.activeUsers.includes(session.username)) {
      group.activeUsers.push(session.username);
    }
  }

  // Process history sessions
  for (const historySession of history) {
    const key = `${historySession.activityType}:${historySession.activityName}`;
    let group = groupsMap.get(key);

    if (!group) {
      group = {
        activityName: historySession.activityName,
        activityType: historySession.activityType,
        totalDuration: 0,
        totalSessions: 0,
        activeUsers: [],
        historySessions: [],
        activeSessions: [],
      };
      groupsMap.set(key, group);
    }

    group.historySessions.push(historySession);
    group.totalDuration += historySession.duration;
    group.totalSessions += 1;
  }

  // Calculate total duration for active sessions
  for (const group of groupsMap.values()) {
    const now = Date.now();
    for (const activeSession of group.activeSessions) {
      const duration = now - activeSession.startTimestamp;
      group.totalDuration += duration;
    }
    group.totalSessions += group.historySessions.length + group.activeSessions.length;
  }

  // Sort by total duration (descending)
  return Array.from(groupsMap.values()).sort((a, b) => b.totalDuration - a.totalDuration);
}

export function formatActivityGroup(group: ActivityGroup): string {
  const typeName = getActivityTypeDisplay(group.activityType);
  const duration = formatDurationForDisplay(group.totalDuration);
  const activeCount = group.activeSessions.length;
  const historyCount = group.historySessions.length;

  let result = `**${group.activityName}** (${typeName})\n`;
  result += `⏱️ Duração total: ${duration}\n`;
  result += `📊 Sessões: ${group.totalSessions} (${activeCount} ativas, ${historyCount} finalizadas)\n`;

  if (group.activeUsers.length > 0) {
    result += `👥 Usuários ativos: ${group.activeUsers.join(", ")}\n`;
  }

  return result;
}
