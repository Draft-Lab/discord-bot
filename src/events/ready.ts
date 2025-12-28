import type { Client } from "discord.js"

export function handleReady(client: Client<true>): void {
	console.log(`✓ Bot ready! Logged in as ${client.user.tag}`)
	console.log(`  User ID: ${client.user.id}`)
	console.log(`  Guilds: ${client.guilds.cache.size}`)
	console.log(`  Watching for presence updates...`)
}
