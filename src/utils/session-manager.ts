import {
  registerPlayerJoined,
  registerPlayerLeft,
} from "@/services/api-client";
import { storage } from "@/services/storage";

export type SessionType = "solo" | "group";

export interface UserSession {
  userId: string;
  username: string;
  avatarUrl: string;
  activityName: string;
  activityType: number;
  startTimestamp: number;
}

export interface GroupSession {
  activityName: string;
  activityType: number;
  users: Map<string, UserSession>;
  createdAt: number;
}

export interface ActivityHistory {
  userId: string;
  username: string;
  activityName: string;
  activityType: number;
  startTimestamp: number;
  endTimestamp: number;
  duration: number;
  sessionType: SessionType;
}

// Storage keys
const SESSIONS_PREFIX = "sessions";
const USER_SESSIONS_PREFIX = "user-sessions";
const HISTORY_PREFIX = "activity-history";

function getGroupSessionKey(
  activityName: string,
  activityType: number,
): string {
  return `${SESSIONS_PREFIX}:${activityType}:${activityName}`;
}

function getUserSessionKey(userId: string): string {
  return `${USER_SESSIONS_PREFIX}:${userId}`;
}

// Get all active users for an activity
export async function getGroupSession(
  activityName: string,
  activityType: number,
): Promise<GroupSession | null> {
  const key = getGroupSessionKey(activityName, activityType);
  const data = await storage.getItem<GroupSession>(key);

  if (!data) return null;

  // Convert users object back to Map
  return {
    ...data,
    users: new Map(Object.entries(data.users)),
  };
}

// Save group session
async function saveGroupSession(session: GroupSession): Promise<void> {
  const key = getGroupSessionKey(session.activityName, session.activityType);

  // Convert Map to object for storage
  const dataToStore = {
    ...session,
    users: Object.fromEntries(session.users),
  };

  await storage.setItem(key, dataToStore);
}

// Get user's active sessions
export async function getUserActiveSessions(
  userId: string,
): Promise<UserSession[]> {
  const key = getUserSessionKey(userId);
  const sessions = await storage.getItem<UserSession[]>(key);
  return sessions ?? [];
}

// Save user's active sessions
async function saveUserSessions(
  userId: string,
  sessions: UserSession[],
): Promise<void> {
  const key = getUserSessionKey(userId);
  await storage.setItem(key, sessions);
}

// Start a user activity session
export async function startUserActivity(
  userId: string,
  username: string,
  avatarUrl: string,
  activityName: string,
  activityType: number,
): Promise<{ sessionType: SessionType; wasAlreadyGroup: boolean }> {
  const now = Date.now();

  // Create user session
  const userSession: UserSession = {
    userId,
    username,
    avatarUrl,
    activityName,
    activityType,
    startTimestamp: now,
  };

  // Add to user's active sessions
  const userSessions = await getUserActiveSessions(userId);
  userSessions.push(userSession);
  await saveUserSessions(userId, userSessions);

  // Update global active sessions list
  const allActive = await getAllActiveSessions();
  allActive.push(userSession);
  await saveAllActiveSessions(allActive);

  // Check if group session exists
  let groupSession = await getGroupSession(activityName, activityType);
  const wasAlreadyGroup = groupSession !== null && groupSession.users.size > 0;

  if (!groupSession) {
    // Create new group session
    groupSession = {
      activityName,
      activityType,
      users: new Map(),
      createdAt: now,
    };
  }

  // Add user to group session
  groupSession.users.set(userId, userSession);
  await saveGroupSession(groupSession);

  const sessionType: SessionType =
    groupSession.users.size > 1 ? "group" : "solo";

  // Register player joined event to API
  await registerPlayerJoined(userId, avatarUrl, username, activityName);

  return { sessionType, wasAlreadyGroup };
}

// Save activity to history
async function saveActivityHistory(history: ActivityHistory): Promise<void> {
  const key = `${HISTORY_PREFIX}:all`;
  const histories = (await storage.getItem<ActivityHistory[]>(key)) ?? [];
  histories.push(history);
  await storage.setItem(key, histories);
}

// Get activity history for a period
export async function getActivityHistory(
  period: "day" | "week" | "month",
): Promise<ActivityHistory[]> {
  const now = Date.now();
  let startTime: number;

  switch (period) {
    case "day":
      startTime = now - 24 * 60 * 60 * 1000;
      break;
    case "week":
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case "month":
      startTime = now - 30 * 24 * 60 * 60 * 1000;
      break;
  }

  const key = `${HISTORY_PREFIX}:all`;
  const allHistories = (await storage.getItem<ActivityHistory[]>(key)) ?? [];

  return allHistories
    .filter((h) => h.endTimestamp >= startTime)
    .sort((a, b) => b.endTimestamp - a.endTimestamp);
}

// Get all activities (active + history) for a period
export async function getAllActivities(
  period: "day" | "week" | "month",
): Promise<{
  active: UserSession[];
  history: ActivityHistory[];
}> {
  const history = await getActivityHistory(period);

  const startTime =
    period === "day"
      ? Date.now() - 24 * 60 * 60 * 1000
      : period === "week"
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : Date.now() - 30 * 24 * 60 * 60 * 1000;

  const allActive = await getAllActiveSessions();
  const activeSessions = allActive.filter((s) => s.startTimestamp >= startTime);

  return {
    active: activeSessions,
    history,
  };
}

// End a user activity session
export async function endUserActivity(
  userId: string,
  activityName: string,
  activityType: number,
): Promise<{
  sessionType: SessionType;
  duration: number;
  remainingUsers: string[];
  userSession: UserSession | null;
} | null> {
  // Get user sessions
  const userSessions = await getUserActiveSessions(userId);
  const sessionIndex = userSessions.findIndex(
    (s) => s.activityName === activityName && s.activityType === activityType,
  );

  if (sessionIndex === -1) return null;

  const userSession = userSessions[sessionIndex];
  if (!userSession) return null;

  const duration = Date.now() - userSession.startTimestamp;
  const endTimestamp = Date.now();

  // Update group session and determine session type
  const groupSession = await getGroupSession(activityName, activityType);
  const remainingUsers = groupSession
    ? Array.from(groupSession.users.keys()).filter((id) => id !== userId)
    : [];

  // Determine if this was a solo or group session
  // If there are remaining users OR if there was more than 1 user before this user left, it's a group session
  const wasGroupSession = groupSession ? groupSession.users.size > 1 : false;
  const sessionType: SessionType = wasGroupSession ? "group" : "solo";

  // Save to history before removing
  const history: ActivityHistory = {
    userId: userSession.userId,
    username: userSession.username,
    activityName: userSession.activityName,
    activityType: userSession.activityType,
    startTimestamp: userSession.startTimestamp,
    endTimestamp,
    duration,
    sessionType,
  };
  await saveActivityHistory(history);

  // Remove from user's active sessions
  userSessions.splice(sessionIndex, 1);
  await saveUserSessions(userId, userSessions);

  // Update global active sessions list
  const allActive = await getAllActiveSessions();
  const globalIndex = allActive.findIndex(
    (s) =>
      s.userId === userId &&
      s.activityName === activityName &&
      s.activityType === activityType,
  );
  if (globalIndex !== -1) {
    allActive.splice(globalIndex, 1);
    await saveAllActiveSessions(allActive);
  }

  if (groupSession) {
    // Remove user from group
    groupSession.users.delete(userId);

    if (remainingUsers.length === 0) {
      // Delete group session if empty
      const key = getGroupSessionKey(activityName, activityType);
      await storage.removeItem(key);
    } else {
      // Update group session
      await saveGroupSession(groupSession);
    }
  }

  // Register player left event to API
  await registerPlayerLeft(
    userId,
    userSession.avatarUrl,
    userSession.username,
    activityName,
  );

  return {
    sessionType,
    duration,
    remainingUsers,
    userSession,
  };
}

// Get all users in a group session
export async function getGroupSessionUsers(
  activityName: string,
  activityType: number,
): Promise<UserSession[]> {
  const session = await getGroupSession(activityName, activityType);
  if (!session) return [];
  return Array.from(session.users.values());
}

// Get all active sessions from all users
export async function getAllActiveSessions(): Promise<UserSession[]> {
  // We'll maintain a list of active sessions in a separate key
  const key = "all-active-sessions";
  const sessions = await storage.getItem<UserSession[]>(key);
  return sessions ?? [];
}

// Save all active sessions list
export async function saveAllActiveSessions(
  sessions: UserSession[],
): Promise<void> {
  const key = "all-active-sessions";
  await storage.setItem(key, sessions);
}
