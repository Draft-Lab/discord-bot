import { Client, Events, GatewayIntentBits } from "discord.js"
import { env } from "@/environment/env"
import { handlePresenceUpdate } from "@/events/presence-update"
import { handleReady } from "@/events/ready"

// Create client with necessary intents to track presence updates
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.GuildMembers
	]
})

// Register event handlers with type-safe event names
client.on(Events.PresenceUpdate, handlePresenceUpdate)
client.once(Events.ClientReady, handleReady)

// Login to Discord
client.login(env.DISCORD_TOKEN).catch((error: unknown) => {
	console.error("Failed to login:", error)
	process.exit(1)
})
