import type { ActivityHistory, UserSession } from "@/utils/session-manager";
import { getAllActivities } from "@/utils/session-manager";
import type { Period } from "./activity-query";

export interface UserStatistics {
  userId: string;
  username: string;
  totalDuration: number;
  totalSessions: number;
  averageSessionDuration: number;
  favoriteActivities: Array<{ name: string; duration: number; sessions: number }>;
  soloSessions: number;
  groupSessions: number;
  peakHour: number; // 0-23
  peakDay: number; // 0-6
}

export interface ActivityStatistics {
  activityName: string;
  activityType: number;
  totalDuration: number;
  totalSessions: number;
  uniqueUsers: number;
  averageSessionDuration: number;
  soloSessions: number;
  groupSessions: number;
  peakHour: number;
}

export interface RetrospectiveData {
  period: Period | "all";
  generatedAt: number;
  general: {
    totalHours: number;
    totalSessions: number;
    mostPopularActivity: string;
    mostActiveUser: string;
    peakHour: number;
    peakDay: number;
  };
  users: UserStatistics[];
  activities: ActivityStatistics[];
  temporal: {
    byHour: number[]; // 24 elementos
    byDayOfWeek: number[]; // 7 elementos
  };
}

function getHourFromTimestamp(timestamp: number): number {
  return new Date(timestamp).getHours();
}

function getDayOfWeekFromTimestamp(timestamp: number): number {
  return new Date(timestamp).getDay(); // 0 = Domingo, 6 = Sábado
}

function calculateUserStatistics(
  userId: string,
  history: ActivityHistory[],
  activeSessions: UserSession[]
): UserStatistics {
  const userHistory = history.filter((h) => h.userId === userId);
  const userActive = activeSessions.filter((s) => s.userId === userId);

  const now = Date.now();
  let totalDuration = 0;
  let soloSessions = 0;
  let groupSessions = 0;
  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);
  const activityMap = new Map<string, { duration: number; sessions: number }>();

  // Process history
  for (const session of userHistory) {
    totalDuration += session.duration;
    if (session.sessionType === "solo") {
      soloSessions++;
    } else {
      groupSessions++;
    }

    const hour = getHourFromTimestamp(session.startTimestamp);
    hourCounts[hour] += session.duration;

    const day = getDayOfWeekFromTimestamp(session.startTimestamp);
    dayCounts[day] += session.duration;

    const key = `${session.activityType}:${session.activityName}`;
    const existing = activityMap.get(key) ?? { duration: 0, sessions: 0 };
    activityMap.set(key, {
      duration: existing.duration + session.duration,
      sessions: existing.sessions + 1,
    });
  }

  // Process active sessions
  for (const session of userActive) {
    const duration = now - session.startTimestamp;
    totalDuration += duration;

    const hour = getHourFromTimestamp(session.startTimestamp);
    hourCounts[hour] += duration;

    const day = getDayOfWeekFromTimestamp(session.startTimestamp);
    dayCounts[day] += duration;

    const key = `${session.activityType}:${session.activityName}`;
    const existing = activityMap.get(key) ?? { duration: 0, sessions: 0 };
    activityMap.set(key, {
      duration: existing.duration + duration,
      sessions: existing.sessions + 1,
    });
  }

  const totalSessions = userHistory.length + userActive.length;
  const averageSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

  const favoriteActivities = Array.from(activityMap.entries())
    .map(([key, data]) => {
      const parts = key.split(":");
      const name = parts.slice(1).join(":") || parts[0] || "Unknown";
      return {
        name,
        duration: data.duration,
        sessions: data.sessions,
      };
    })
    .filter((a) => a.name !== "Unknown")
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);

  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const peakDay = dayCounts.indexOf(Math.max(...dayCounts));

  const username = userHistory[0]?.username ?? userActive[0]?.username ?? "Unknown";

  return {
    userId,
    username,
    totalDuration,
    totalSessions,
    averageSessionDuration,
    favoriteActivities,
    soloSessions,
    groupSessions,
    peakHour,
    peakDay,
  };
}

function calculateActivityStatistics(
  activityName: string,
  activityType: number,
  history: ActivityHistory[],
  activeSessions: UserSession[]
): ActivityStatistics {
  const activityHistory = history.filter(
    (h) => h.activityName === activityName && h.activityType === activityType
  );
  const activityActive = activeSessions.filter(
    (s) => s.activityName === activityName && s.activityType === activityType
  );

  const now = Date.now();
  let totalDuration = 0;
  let soloSessions = 0;
  let groupSessions = 0;
  const hourCounts = new Array(24).fill(0);
  const uniqueUserIds = new Set<string>();

  // Process history
  for (const session of activityHistory) {
    totalDuration += session.duration;
    uniqueUserIds.add(session.userId);
    if (session.sessionType === "solo") {
      soloSessions++;
    } else {
      groupSessions++;
    }

    const hour = getHourFromTimestamp(session.startTimestamp);
    hourCounts[hour] += session.duration;
  }

  // Process active sessions
  for (const session of activityActive) {
    const duration = now - session.startTimestamp;
    totalDuration += duration;
    uniqueUserIds.add(session.userId);

    const hour = getHourFromTimestamp(session.startTimestamp);
    hourCounts[hour] += duration;
  }

  const totalSessions = activityHistory.length + activityActive.length;
  const averageSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  return {
    activityName,
    activityType,
    totalDuration,
    totalSessions,
    uniqueUsers: uniqueUserIds.size,
    averageSessionDuration,
    soloSessions,
    groupSessions,
    peakHour,
  };
}

function calculateTemporalDistribution(
  history: ActivityHistory[],
  activeSessions: UserSession[]
): { byHour: number[]; byDayOfWeek: number[] } {
  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);
  const now = Date.now();

  // Process history
  for (const session of history) {
    const hour = getHourFromTimestamp(session.startTimestamp);
    hourCounts[hour] += session.duration;

    const day = getDayOfWeekFromTimestamp(session.startTimestamp);
    dayCounts[day] += session.duration;
  }

  // Process active sessions
  for (const session of activeSessions) {
    const duration = now - session.startTimestamp;
    const hour = getHourFromTimestamp(session.startTimestamp);
    hourCounts[hour] += duration;

    const day = getDayOfWeekFromTimestamp(session.startTimestamp);
    dayCounts[day] += duration;
  }

  return {
    byHour: hourCounts,
    byDayOfWeek: dayCounts,
  };
}

export async function generateRetrospective(
  period: Period | "all"
): Promise<RetrospectiveData> {
  let history: ActivityHistory[];
  let activeSessions: UserSession[];

  if (period === "all") {
    // Get all history
    const { storage } = await import("@/services/storage");
    const key = "activity-history:all";
    const allHistories = (await storage.getItem<ActivityHistory[]>(key)) ?? [];
    history = allHistories.sort((a, b) => b.endTimestamp - a.endTimestamp);

    // Get all active sessions
    const { getAllActiveSessions } = await import("@/utils/session-manager");
    activeSessions = await getAllActiveSessions();
  } else {
    const activities = await getAllActivities(period);
    history = activities.history;
    activeSessions = activities.active;
  }

  if (history.length === 0 && activeSessions.length === 0) {
    return {
      period,
      generatedAt: Date.now(),
      general: {
        totalHours: 0,
        totalSessions: 0,
        mostPopularActivity: "N/A",
        mostActiveUser: "N/A",
        peakHour: 0,
        peakDay: 0,
      },
      users: [],
      activities: [],
      temporal: {
        byHour: new Array(24).fill(0),
        byDayOfWeek: new Array(7).fill(0),
      },
    };
  }

  // Get unique users
  const userIds = new Set<string>();
  for (const h of history) {
    userIds.add(h.userId);
  }
  for (const s of activeSessions) {
    userIds.add(s.userId);
  }

  // Get unique activities
  const activityKeys = new Set<string>();
  for (const h of history) {
    activityKeys.add(`${h.activityType}:${h.activityName}`);
  }
  for (const s of activeSessions) {
    activityKeys.add(`${s.activityType}:${s.activityName}`);
  }

  // Calculate user statistics
  const users = Array.from(userIds).map((userId) =>
    calculateUserStatistics(userId, history, activeSessions)
  );

  // Calculate activity statistics
  const activities = Array.from(activityKeys)
    .map((key) => {
      const parts = key.split(":");
      const typeStr = parts[0];
      const name = parts.slice(1).join(":") || parts[0] || "Unknown";
      const type = Number.parseInt(typeStr ?? "0", 10);
      if (!name || name === "Unknown") return null;
      return calculateActivityStatistics(name, type, history, activeSessions);
    })
    .filter((a): a is ActivityStatistics => a !== null);

  // Calculate temporal distribution
  const temporal = calculateTemporalDistribution(history, activeSessions);

  // Calculate general statistics
  const totalDuration = users.reduce((sum, u) => sum + u.totalDuration, 0);
  const totalSessions = history.length + activeSessions.length;
  const sortedActivities = [...activities].sort(
    (a, b) => b.totalDuration - a.totalDuration
  );
  const mostPopularActivity =
    sortedActivities.length > 0 ? sortedActivities[0]?.activityName ?? "N/A" : "N/A";
  const sortedUsers = [...users].sort((a, b) => b.totalDuration - a.totalDuration);
  const mostActiveUser =
    sortedUsers.length > 0 ? sortedUsers[0]?.username ?? "N/A" : "N/A";
  const peakHour = temporal.byHour.indexOf(Math.max(...temporal.byHour));
  const peakDay = temporal.byDayOfWeek.indexOf(Math.max(...temporal.byDayOfWeek));

  return {
    period,
    generatedAt: Date.now(),
    general: {
      totalHours: totalDuration / (1000 * 60 * 60),
      totalSessions,
      mostPopularActivity,
      mostActiveUser,
      peakHour,
      peakDay,
    },
    users: users.sort((a, b) => b.totalDuration - a.totalDuration),
    activities: activities.sort((a, b) => b.totalDuration - a.totalDuration),
    temporal,
  };
}
