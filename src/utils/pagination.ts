import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	type Interaction,
	StringSelectMenuBuilder
} from "discord.js"
import type { ActivityGroup, Period } from "@/services/activity-query"
import { formatActivityGroup } from "@/services/activity-query"

const ITEMS_PER_PAGE = 10

export class ActivityPagination {
	private currentPage: number
	private period: Period
	private activities: ActivityGroup[]
	private userId: string

	constructor(activities: ActivityGroup[], period: Period, userId: string, initialPage = 0) {
		this.activities = activities
		this.period = period
		this.userId = userId
		this.currentPage = initialPage
	}

	getPeriod(): Period {
		return this.period
	}

	getTotalPages(): number {
		return Math.max(1, Math.ceil(this.activities.length / ITEMS_PER_PAGE))
	}

	getCurrentPageItems(): ActivityGroup[] {
		const start = this.currentPage * ITEMS_PER_PAGE
		const end = start + ITEMS_PER_PAGE
		return this.activities.slice(start, end)
	}

	setPeriod(period: Period): void {
		this.period = period
		this.currentPage = 0
	}

	setActivities(activities: ActivityGroup[]): void {
		this.activities = activities
		this.currentPage = 0
	}

	nextPage(): boolean {
		if (this.currentPage < this.getTotalPages() - 1) {
			this.currentPage++
			return true
		}
		return false
	}

	previousPage(): boolean {
		if (this.currentPage > 0) {
			this.currentPage--
			return true
		}
		return false
	}

	goToPage(page: number): boolean {
		if (page >= 0 && page < this.getTotalPages()) {
			this.currentPage = page
			return true
		}
		return false
	}

	createEmbed(): EmbedBuilder {
		const items = this.getCurrentPageItems()
		const totalPages = this.getTotalPages()
		const periodNames: Record<Period, string> = {
			day: "Dia",
			week: "Semana",
			month: "Mês"
		}

		const embed = new EmbedBuilder()
			.setTitle(`📊 Lista de Atividades - ${periodNames[this.period]}`)
			.setColor(0x5865f2)
			.setFooter({
				text: `Página ${this.currentPage + 1} de ${totalPages} • Total: ${
					this.activities.length
				} atividades`
			})
			.setTimestamp()

		if (items.length === 0) {
			embed.setDescription("Nenhuma atividade encontrada para este período.")
			return embed
		}

		let description = ""
		for (let i = 0; i < items.length; i++) {
			const item = items[i]
			if (item) {
				const index = this.currentPage * ITEMS_PER_PAGE + i + 1
				description += `**${index}.** ${formatActivityGroup(item)}\n\n`
			}
		}

		embed.setDescription(description)

		// Add summary if there are multiple pages
		if (totalPages > 1) {
			const start = this.currentPage * ITEMS_PER_PAGE + 1
			const end = Math.min(start + ITEMS_PER_PAGE - 1, this.activities.length)
			embed.addFields({
				name: "📈 Resumo",
				value: `Mostrando atividades ${start}-${end} de ${this.activities.length}`
			})
		}

		return embed
	}

	createComponents(): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
		const totalPages = this.getTotalPages()
		const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = []

		// Navigation buttons
		const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`pagination:prev:${this.userId}`)
				.setLabel("◀ Anterior")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(this.currentPage === 0),
			new ButtonBuilder()
				.setCustomId(`pagination:next:${this.userId}`)
				.setLabel("Próximo ▶")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(this.currentPage >= totalPages - 1)
		)

		rows.push(navRow)

		// Period selector
		const periodRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`pagination:period:${this.userId}`)
				.setPlaceholder(
					`Filtrar por: ${
						this.period === "day" ? "Dia" : this.period === "week" ? "Semana" : "Mês"
					}`
				)
				.addOptions([
					{
						label: "Últimas 24 horas",
						value: "day",
						description: "Atividades do dia",
						default: this.period === "day"
					},
					{
						label: "Últimos 7 dias",
						value: "week",
						description: "Atividades da semana",
						default: this.period === "week"
					},
					{
						label: "Últimos 30 dias",
						value: "month",
						description: "Atividades do mês",
						default: this.period === "month"
					}
				])
		)

		rows.push(periodRow)

		return rows
	}

	async handleInteraction(
		interaction: Interaction
	): Promise<{ shouldUpdate: boolean; newPeriod?: Period }> {
		if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
			return { shouldUpdate: false }
		}

		const customId = interaction.customId

		if (!customId.includes(this.userId)) {
			await interaction.reply({
				content: "Esta interação não é sua!",
				ephemeral: true
			})
			return { shouldUpdate: false }
		}

		if (interaction.isButton()) {
			if (customId.includes("prev")) {
				if (this.previousPage()) {
					await interaction.update({
						embeds: [this.createEmbed()],
						components: this.createComponents()
					})
					return { shouldUpdate: true }
				}
			} else if (customId.includes("next")) {
				if (this.nextPage()) {
					await interaction.update({
						embeds: [this.createEmbed()],
						components: this.createComponents()
					})
					return { shouldUpdate: true }
				}
			}
		} else if (interaction.isStringSelectMenu()) {
			if (customId.includes("period")) {
				const newPeriod = interaction.values[0] as Period
				if (newPeriod !== this.period) {
					// Don't update here, let the command handler fetch new data
					return { shouldUpdate: true, newPeriod }
				}
			}
		}

		return { shouldUpdate: false }
	}
}
