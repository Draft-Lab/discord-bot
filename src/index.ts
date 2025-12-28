import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type Interaction,
} from "discord.js";
import { env } from "@/environment/env";
import { handlePresenceUpdate } from "@/events/presence-update";
import { handleReady } from "@/events/ready";
import { atividadesCommand } from "@/commands/atividades";
import { retrospectivaCommand } from "@/commands/retrospectiva";

// Create client with necessary intents to track presence updates
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
});

// Register event handlers with type-safe event names
client.on(Events.PresenceUpdate, handlePresenceUpdate);
client.once(Events.ClientReady, async (readyClient) => {
  handleReady(readyClient);

  // Register slash commands
  try {
    const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

    // Prepare commands with validation
    const commandDefinitions = [
      { name: "atividades", command: atividadesCommand },
      { name: "retrospectiva", command: retrospectivaCommand },
    ];

    console.log("Started refreshing application (/) commands.\n");

    // Validate and log each command
    const commands = [];
    for (const { name, command } of commandDefinitions) {
      try {
        if (!command.data) {
          throw new Error(`Command data is missing for ${name}`);
        }
        const commandJSON = command.data.toJSON();
        commands.push(commandJSON);
        console.log(`  ✓ Prepared: /${name}`);
      } catch (err) {
        console.error(`  ✗ Failed to prepare /${name}:`, err);
        throw err;
      }
    }

    console.log(`\nRegistering ${commands.length} command(s)...`);

    // Register commands globally (takes up to 1 hour to propagate)
    const registeredCommands = (await rest.put(
      Routes.applicationCommands(readyClient.user.id),
      {
        body: commands,
      }
    )) as Array<{ name: string; id: string }>;

    console.log("\n✓ Successfully reloaded application (/) commands:");
    for (const cmd of registeredCommands) {
      console.log(`  ✓ /${cmd.name} (ID: ${cmd.id})`);
    }
    console.log(
      `\nTotal: ${registeredCommands.length} command(s) registered successfully`
    );

    // Verify expected commands
    const expectedNames = ["atividades", "retrospectiva"];
    const registeredNames = registeredCommands.map((c) => c.name);
    const missing = expectedNames.filter((name) => !registeredNames.includes(name));

    if (missing.length > 0) {
      console.warn(
        `\n⚠ Warning: Some commands may not have been registered: ${missing.join(", ")}`
      );
    } else {
      console.log(`\n✓ All expected commands registered: ${expectedNames.join(", ")}`);
    }

    console.log("\nNote: Global commands may take up to 1 hour to appear in Discord.");
  } catch (error) {
    console.error("\n✗ Error registering commands:");
    if (error instanceof Error) {
      console.error(`  ✗ Error: ${error.message}`);
      if (error.stack) {
        console.error(`  ✗ Stack: ${error.stack}`);
      }
    } else {
      console.error("  ✗ Failed to register commands:", error);
    }
  }
});

// Handle interactions
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "atividades") {
      await atividadesCommand.execute(interaction);
    } else if (interaction.commandName === "retrospectiva") {
      await retrospectivaCommand.execute(interaction);
    }
  }
});

// Login to Discord
client.login(env.DISCORD_TOKEN).catch((error: unknown) => {
  console.error("Failed to login:", error);
  process.exit(1);
});
