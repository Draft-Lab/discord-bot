import { storage } from "@/services/storage"

export type SessionType = "solo" | "group"

export interface UserSession {
	userId: string
	username: string
	activityName: string
	activityType: number
	startTimestamp: number
}

export interface GroupSession {
	activityName: string
	activityType: number
	users: Map<string, UserSession>
	createdAt: number
}

// Storage keys
const SESSIONS_PREFIX = "sessions"
const USER_SESSIONS_PREFIX = "user-sessions"

function getGroupSessionKey(activityName: string, activityType: number): string {
	return `${SESSIONS_PREFIX}:${activityType}:${activityName}`
}

function getUserSessionKey(userId: string): string {
	return `${USER_SESSIONS_PREFIX}:${userId}`
}

// Get all active users for an activity
export async function getGroupSession(
	activityName: string,
	activityType: number
): Promise<GroupSession | null> {
	const key = getGroupSessionKey(activityName, activityType)
	const data = await storage.getItem<GroupSession>(key)

	if (!data) return null

	// Convert users object back to Map
	return {
		...data,
		users: new Map(Object.entries(data.users))
	}
}

// Save group session
async function saveGroupSession(session: GroupSession): Promise<void> {
	const key = getGroupSessionKey(session.activityName, session.activityType)

	// Convert Map to object for storage
	const dataToStore = {
		...session,
		users: Object.fromEntries(session.users)
	}

	await storage.setItem(key, dataToStore)
}

// Get user's active sessions
export async function getUserActiveSessions(userId: string): Promise<UserSession[]> {
	const key = getUserSessionKey(userId)
	const sessions = await storage.getItem<UserSession[]>(key)
	return sessions ?? []
}

// Save user's active sessions
async function saveUserSessions(userId: string, sessions: UserSession[]): Promise<void> {
	const key = getUserSessionKey(userId)
	await storage.setItem(key, sessions)
}

// Start a user activity session
export async function startUserActivity(
	userId: string,
	username: string,
	activityName: string,
	activityType: number
): Promise<{ sessionType: SessionType; wasAlreadyGroup: boolean }> {
	const now = Date.now()

	// Create user session
	const userSession: UserSession = {
		userId,
		username,
		activityName,
		activityType,
		startTimestamp: now
	}

	// Add to user's active sessions
	const userSessions = await getUserActiveSessions(userId)
	userSessions.push(userSession)
	await saveUserSessions(userId, userSessions)

	// Check if group session exists
	let groupSession = await getGroupSession(activityName, activityType)
	const wasAlreadyGroup = groupSession !== null && groupSession.users.size > 0

	if (!groupSession) {
		// Create new group session
		groupSession = {
			activityName,
			activityType,
			users: new Map(),
			createdAt: now
		}
	}

	// Add user to group session
	groupSession.users.set(userId, userSession)
	await saveGroupSession(groupSession)

	const sessionType: SessionType = groupSession.users.size > 1 ? "group" : "solo"

	return { sessionType, wasAlreadyGroup }
}

// End a user activity session
export async function endUserActivity(
	userId: string,
	activityName: string,
	activityType: number
): Promise<{
	sessionType: SessionType
	duration: number
	remainingUsers: string[]
	userSession: UserSession | null
} | null> {
	// Get user sessions
	const userSessions = await getUserActiveSessions(userId)
	const sessionIndex = userSessions.findIndex(
		(s) => s.activityName === activityName && s.activityType === activityType
	)

	if (sessionIndex === -1) return null

	const userSession = userSessions[sessionIndex]
	if (!userSession) return null

	const duration = Date.now() - userSession.startTimestamp

	// Remove from user's active sessions
	userSessions.splice(sessionIndex, 1)
	await saveUserSessions(userId, userSessions)

	// Update group session
	const groupSession = await getGroupSession(activityName, activityType)
	if (!groupSession) return null

	// Remove user from group
	groupSession.users.delete(userId)

	const remainingUsers = Array.from(groupSession.users.keys())
	const sessionType: SessionType = remainingUsers.length > 0 ? "group" : "solo"

	if (remainingUsers.length === 0) {
		// Delete group session if empty
		const key = getGroupSessionKey(activityName, activityType)
		await storage.removeItem(key)
	} else {
		// Update group session
		await saveGroupSession(groupSession)
	}

	return {
		sessionType,
		duration,
		remainingUsers,
		userSession
	}
}

// Get all users in a group session
export async function getGroupSessionUsers(
	activityName: string,
	activityType: number
): Promise<UserSession[]> {
	const session = await getGroupSession(activityName, activityType)
	if (!session) return []
	return Array.from(session.users.values())
}
