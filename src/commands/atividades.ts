import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	Collection,
	type Message,
	SlashCommandBuilder
} from "discord.js"
import { getActivitiesByPeriod, type Period } from "@/services/activity-query"
import { ActivityPagination } from "@/utils/pagination"

// Store pagination instances per user
const paginationInstances = new Collection<string, ActivityPagination>()

export const atividadesCommand = {
	data: new SlashCommandBuilder()
		.setName("atividades")
		.setDescription("Exibe lista de atividades com filtros e paginação")
		.addStringOption((option) =>
			option
				.setName("filtro")
				.setDescription("Filtrar por período")
				.setRequired(false)
				.addChoices(
					{ name: "Dia", value: "day" },
					{ name: "Semana", value: "week" },
					{ name: "Mês", value: "month" }
				)
		),

	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.deferReply()

		const period = (interaction.options.getString("filtro") ?? "day") as Period
		const userId = interaction.user.id

		try {
			const activities = await getActivitiesByPeriod(period)

			const pagination = new ActivityPagination(activities, period, userId)
			paginationInstances.set(userId, pagination)

			const embed = pagination.createEmbed()
			const components = pagination.createComponents()

			const message = await interaction.editReply({
				embeds: [embed],
				components
			})

			// Set up collector for interactions
			setupCollector(message, userId, pagination)
		} catch (error) {
			console.error("Error executing atividades command:", error)
			await interaction.editReply({
				content: "❌ Ocorreu um erro ao buscar as atividades. Tente novamente."
			})
		}
	}
}

function setupCollector(
	message: Message,
	userId: string,
	pagination: ActivityPagination
): void {
	const collector = message.createMessageComponentCollector({
		filter: (i) => {
			return (i.isButton() || i.isStringSelectMenu()) && i.customId.includes(userId)
		},
		time: 5 * 60 * 1000 // 5 minutes
	})

	collector.on("collect", async (interaction) => {
		// Check if it's a period change first
		if (interaction.isStringSelectMenu() && interaction.customId.includes("period")) {
			const newPeriod = interaction.values[0] as Period
			if (newPeriod !== pagination.getPeriod()) {
				// Period changed, fetch new data
				try {
					await interaction.deferUpdate()
					const newActivities = await getActivitiesByPeriod(newPeriod)
					pagination.setPeriod(newPeriod)
					pagination.setActivities(newActivities)

					await interaction.editReply({
						embeds: [pagination.createEmbed()],
						components: pagination.createComponents()
					})
				} catch (error) {
					console.error("Error updating period:", error)
					await interaction.followUp({
						content: "❌ Erro ao atualizar o filtro. Tente novamente.",
						ephemeral: true
					})
				}
				return
			}
		}

		// Handle button interactions
		await pagination.handleInteraction(interaction)
		// Button interactions are already handled in handleInteraction
	})

	collector.on("end", async () => {
		// Disable all components when collector ends
		try {
			const components = pagination.createComponents()
			const disabledComponents = components.map((row) => {
				const newRow = ActionRowBuilder.from(row)
				newRow.components.forEach((component) => {
					if ("setDisabled" in component) {
						component.setDisabled(true)
					}
				})
				return newRow.toJSON()
			})

			await message.edit({
				components: disabledComponents
			})
		} catch (error) {
			// Message might have been deleted, ignore
			console.error("Error disabling components:", error)
		}

		paginationInstances.delete(userId)
	})
}
