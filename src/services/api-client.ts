import { env } from "@/environment/env";

export type EventType = "player_joined" | "player_left";

export interface RegisterEventPayload {
  discord_id: string;
  discord_name: string;
  discord_avatar: string;
  game_title: string;
  event_type: EventType;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
}

/**
 * Registers an event (player joined/left) to the Discord bot API
 */
export async function registerEvent(
  payload: RegisterEventPayload,
): Promise<ApiResponse> {
  try {
    const response = await fetch(
      `${env.DISCORD_BOT_API_URL}/api/discord/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DISCORD_BOT_API_KEY}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      console.error(
        `[API ERROR] Failed to register event: ${response.status} ${response.statusText}`,
      );
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as { message?: string };
    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    console.error("[API ERROR] Exception when registering event:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Registers a player joined event
 */
export async function registerPlayerJoined(
  discordId: string,
  discordAvatar: string,
  discordUsername: string,
  gameTitle: string,
): Promise<ApiResponse> {
  return registerEvent({
    discord_id: discordId,
    discord_name: discordUsername,
    discord_avatar: discordAvatar,
    game_title: gameTitle,
    event_type: "player_joined",
  });
}

/**
 * Registers a player left event
 */
export async function registerPlayerLeft(
  discordId: string,
  discordAvatar: string,
  discordUsername: string,
  gameTitle: string,
): Promise<ApiResponse> {
  return registerEvent({
    discord_id: discordId,
    discord_name: discordUsername,
    discord_avatar: discordAvatar,
    game_title: gameTitle,
    event_type: "player_left",
  });
}
