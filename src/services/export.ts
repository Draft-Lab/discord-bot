import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ActivityStatistics, RetrospectiveData, UserStatistics } from "./statistics"

const EXPORT_DIR = join(process.cwd(), ".exports")

async function ensureExportDir(): Promise<void> {
	try {
		await mkdir(EXPORT_DIR, { recursive: true })
	} catch (_error) {
		// Directory might already exist, ignore
	}
}

function formatDuration(milliseconds: number): string {
	const hours = Math.floor(milliseconds / (1000 * 60 * 60))
	const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60))
	const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000)
	return `${hours}h ${minutes}m ${seconds}s`
}

export async function exportToJSON(data: RetrospectiveData): Promise<string> {
	await ensureExportDir()
	const filename = `retrospectiva-${data.period}-${Date.now()}.json`
	const filepath = join(EXPORT_DIR, filename)

	await writeFile(filepath, JSON.stringify(data, null, 2), "utf-8")
	return filepath
}

function escapeCSV(value: string | number): string {
	const str = String(value)
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`
	}
	return str
}

function userStatisticsToCSV(users: UserStatistics[]): string {
	const headers = [
		"User ID",
		"Username",
		"Total Duration (ms)",
		"Total Duration (formatted)",
		"Total Sessions",
		"Average Session Duration (ms)",
		"Average Session Duration (formatted)",
		"Solo Sessions",
		"Group Sessions",
		"Peak Hour",
		"Peak Day",
		"Top Activity 1",
		"Top Activity 1 Duration",
		"Top Activity 1 Sessions",
		"Top Activity 2",
		"Top Activity 2 Duration",
		"Top Activity 2 Sessions",
		"Top Activity 3",
		"Top Activity 3 Duration",
		"Top Activity 3 Sessions"
	]

	const rows = users.map((user) => {
		const topActivities = user.favoriteActivities.slice(0, 3)
		return [
			escapeCSV(user.userId),
			escapeCSV(user.username),
			escapeCSV(user.totalDuration),
			escapeCSV(formatDuration(user.totalDuration)),
			escapeCSV(user.totalSessions),
			escapeCSV(user.averageSessionDuration),
			escapeCSV(formatDuration(user.averageSessionDuration)),
			escapeCSV(user.soloSessions),
			escapeCSV(user.groupSessions),
			escapeCSV(user.peakHour),
			escapeCSV(user.peakDay),
			escapeCSV(topActivities[0]?.name ?? ""),
			escapeCSV(topActivities[0]?.duration ?? 0),
			escapeCSV(topActivities[0]?.sessions ?? 0),
			escapeCSV(topActivities[1]?.name ?? ""),
			escapeCSV(topActivities[1]?.duration ?? 0),
			escapeCSV(topActivities[1]?.sessions ?? 0),
			escapeCSV(topActivities[2]?.name ?? ""),
			escapeCSV(topActivities[2]?.duration ?? 0),
			escapeCSV(topActivities[2]?.sessions ?? 0)
		].join(",")
	})

	return [headers.join(","), ...rows].join("\n")
}

function activityStatisticsToCSV(activities: ActivityStatistics[]): string {
	const headers = [
		"Activity Name",
		"Activity Type",
		"Total Duration (ms)",
		"Total Duration (formatted)",
		"Total Sessions",
		"Unique Users",
		"Average Session Duration (ms)",
		"Average Session Duration (formatted)",
		"Solo Sessions",
		"Group Sessions",
		"Peak Hour"
	]

	const rows = activities.map((activity) => [
		escapeCSV(activity.activityName),
		escapeCSV(activity.activityType),
		escapeCSV(activity.totalDuration),
		escapeCSV(formatDuration(activity.totalDuration)),
		escapeCSV(activity.totalSessions),
		escapeCSV(activity.uniqueUsers),
		escapeCSV(activity.averageSessionDuration),
		escapeCSV(formatDuration(activity.averageSessionDuration)),
		escapeCSV(activity.soloSessions),
		escapeCSV(activity.groupSessions),
		escapeCSV(activity.peakHour)
	])

	return [headers.join(","), ...rows.map((row) => row.map(escapeCSV).join(","))].join("\n")
}

function temporalToCSV(temporal: RetrospectiveData["temporal"]): string {
	const hourHeaders = ["Hour", "Duration (ms)", "Duration (formatted)"]
	const hourRows = temporal.byHour.map((duration, hour) => [
		escapeCSV(hour),
		escapeCSV(duration),
		escapeCSV(formatDuration(duration))
	])

	const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
	const dayHeaders = ["Day", "Duration (ms)", "Duration (formatted)"]
	const dayRows = temporal.byDayOfWeek.map((duration, day) => [
		escapeCSV(dayNames[day] ?? `Dia ${day}`),
		escapeCSV(duration),
		escapeCSV(formatDuration(duration))
	])

	return [
		"=== Por Hora ===",
		hourHeaders.join(","),
		...hourRows.map((row) => row.join(",")),
		"",
		"=== Por Dia da Semana ===",
		dayHeaders.join(","),
		...dayRows.map((row) => row.join(","))
	].join("\n")
}

export async function exportToCSV(data: RetrospectiveData): Promise<string[]> {
	await ensureExportDir()
	const timestamp = Date.now()
	const prefix = `retrospectiva-${data.period}-${timestamp}`

	const files: string[] = []

	// Export users
	const usersCSV = userStatisticsToCSV(data.users)
	const usersFile = join(EXPORT_DIR, `${prefix}-usuarios.csv`)
	await writeFile(usersFile, usersCSV, "utf-8")
	files.push(usersFile)

	// Export activities
	const activitiesCSV = activityStatisticsToCSV(data.activities)
	const activitiesFile = join(EXPORT_DIR, `${prefix}-atividades.csv`)
	await writeFile(activitiesFile, activitiesCSV, "utf-8")
	files.push(activitiesFile)

	// Export temporal data
	const temporalCSV = temporalToCSV(data.temporal)
	const temporalFile = join(EXPORT_DIR, `${prefix}-tendencias.csv`)
	await writeFile(temporalFile, temporalCSV, "utf-8")
	files.push(temporalFile)

	return files
}

export async function exportRetrospective(
	data: RetrospectiveData,
	format: "json" | "csv" | "both"
): Promise<string[]> {
	const files: string[] = []

	if (format === "json" || format === "both") {
		const jsonFile = await exportToJSON(data)
		files.push(jsonFile)
	}

	if (format === "csv" || format === "both") {
		const csvFiles = await exportToCSV(data)
		files.push(...csvFiles)
	}

	return files
}
