import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { generateRetrospective } from "@/services/statistics";
import { exportRetrospective } from "@/services/export";
import type { Period } from "@/services/activity-query";

function formatDuration(milliseconds: number): string {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m}m`;
}

const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const retrospectivaCommand = {
  data: new SlashCommandBuilder()
    .setName("retrospectiva")
    .setDescription("Gera retrospectiva completa de atividades")
    .addStringOption((option) =>
      option
        .setName("periodo")
        .setDescription("Período para análise")
        .setRequired(false)
        .addChoices(
          { name: "Dia", value: "day" },
          { name: "Semana", value: "week" },
          { name: "Mês", value: "month" },
          { name: "Todos", value: "all" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("formato")
        .setDescription("Formato de exportação")
        .setRequired(false)
        .addChoices(
          { name: "JSON", value: "json" },
          { name: "CSV", value: "csv" },
          { name: "Ambos", value: "both" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const period = (interaction.options.getString("periodo") ?? "month") as
      | Period
      | "all";
    const format = (interaction.options.getString("formato") ?? "both") as
      | "json"
      | "csv"
      | "both";

    try {
      // Generate retrospective data
      const data = await generateRetrospective(period);

      if (data.users.length === 0 && data.activities.length === 0) {
        await interaction.editReply({
          content:
            "❌ Nenhum dado encontrado para o período selecionado. Tente outro período.",
        });
        return;
      }

      // Create preview embed
      const embed = new EmbedBuilder()
        .setTitle(
          `📊 Retrospectiva - ${
            period === "all"
              ? "Todos"
              : period === "day"
              ? "Dia"
              : period === "week"
              ? "Semana"
              : "Mês"
          }`
        )
        .setColor(0x5865f2)
        .setTimestamp(new Date(data.generatedAt))
        .addFields(
          {
            name: "📈 Estatísticas Gerais",
            value: [
              `⏱️ Total: ${formatHours(data.general.totalHours)}`,
              `📊 Sessões: ${data.general.totalSessions}`,
              `🎮 Atividade mais popular: ${data.general.mostPopularActivity}`,
              `👤 Usuário mais ativo: ${data.general.mostActiveUser}`,
              `🕐 Horário de pico: ${data.general.peakHour}h`,
              `📅 Dia mais ativo: ${dayNames[data.general.peakDay]}`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "👥 Top 5 Usuários",
            value:
              data.users.slice(0, 5).length > 0
                ? data.users
                    .slice(0, 5)
                    .map(
                      (u, i) =>
                        `${i + 1}. **${u.username}** - ${formatDuration(
                          u.totalDuration
                        )} (${u.totalSessions} sessões)`
                    )
                    .join("\n")
                : "N/A",
            inline: false,
          },
          {
            name: "🎮 Top 5 Atividades",
            value:
              data.activities.slice(0, 5).length > 0
                ? data.activities
                    .slice(0, 5)
                    .map(
                      (a, i) =>
                        `${i + 1}. **${a.activityName}** - ${formatDuration(
                          a.totalDuration
                        )} (${a.totalSessions} sessões, ${a.uniqueUsers} usuários)`
                    )
                    .join("\n")
                : "N/A",
            inline: false,
          }
        )
        .setFooter({
          text: `Gerado em ${new Date(data.generatedAt).toLocaleString("pt-BR")}`,
        });

      // Export files
      const files = await exportRetrospective(data, format);

      // Create attachments
      const attachments = files.map(
        (filepath) =>
          new AttachmentBuilder(filepath, {
            name: filepath.split(/[/\\]/).pop() ?? "file",
          })
      );

      await interaction.editReply({
        embeds: [embed],
        files: attachments,
      });
    } catch (error) {
      console.error("Error generating retrospective:", error);
      await interaction.editReply({
        content: "❌ Ocorreu um erro ao gerar a retrospectiva. Tente novamente.",
      });
    }
  },
};
