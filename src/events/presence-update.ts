import type { Activity, Presence } from "discord.js";
import {
  endUserActivity,
  getGroupSessionUsers,
  startUserActivity,
} from "@/utils/session-manager";

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export async function handlePresenceUpdate(
  oldPresence: Presence | null,
  newPresence: Presence,
): Promise<void> {
  // Skip if no user information is available
  if (!newPresence.user) {
    return;
  }

  const user = newPresence.user;
  const username = user.tag;
  const userId = user.id;

  // Get status information
  const oldStatus = oldPresence?.status ?? "offline";
  const newStatus = newPresence.status;

  // Only log if status actually changed
  if (oldStatus !== newStatus) {
    console.log(`[STATUS CHANGE] ${username} (${userId})`);
    console.log(`  Old Status: ${oldStatus}`);
    console.log(`  New Status: ${newStatus}`);
    console.log(`  Timestamp: ${new Date().toISOString()}`);

    // Log client status (desktop, mobile, web)
    if (newPresence.clientStatus) {
      console.log("  Active on:", {
        desktop: newPresence.clientStatus.desktop,
        mobile: newPresence.clientStatus.mobile,
        web: newPresence.clientStatus.web,
      });
    }
  }

  // Track activity changes with sessions
  const oldActivities = oldPresence?.activities ?? [];
  const newActivities = newPresence.activities;

  // Create maps for easy comparison
  const oldActivityMap = new Map<string, Activity>();
  for (const activity of oldActivities) {
    oldActivityMap.set(`${activity.type}:${activity.name}`, activity);
  }

  const newActivityMap = new Map<string, Activity>();
  for (const activity of newActivities) {
    newActivityMap.set(`${activity.type}:${activity.name}`, activity);
  }

  // Check for ended activities
  for (const [key, activity] of oldActivityMap) {
    if (!newActivityMap.has(key)) {
      const result = await endUserActivity(
        userId,
        activity.name,
        activity.type,
      );

      if (result) {
        const { sessionType, duration, remainingUsers } = result;

        console.log(
          `\n[SESSION COMPLETED - ${sessionType.toUpperCase()}] ${username} (${userId})`,
        );
        console.log(`  Activity: ${activity.name}`);
        console.log(`  Type: ${activity.type}`);
        console.log(`  Duration: ${formatDuration(duration)}`);
        console.log(`  Ended at: ${new Date().toISOString()}`);

        if (sessionType === "group") {
          console.log(`  Remaining users in group: ${remainingUsers.length}`);

          // If user left group, show remaining participants
          if (remainingUsers.length > 0) {
            const users = await getGroupSessionUsers(
              activity.name,
              activity.type,
            );
            console.log(
              `  Still active: ${users.map((u) => u.username).join(", ")}`,
            );
          } else {
            // Group session ended (last user left)
            console.log("  🏁 GROUP SESSION ENDED - All users have left");
          }
        } else {
          // Solo session completed
          console.log("  🏃 SOLO SESSION COMPLETED");
        }
      }
    }
  }

  // Check for new activities
  for (const [key, activity] of newActivityMap) {
    if (!oldActivityMap.has(key)) {
      const { sessionType, wasAlreadyGroup } = await startUserActivity(
        userId,
        username,
        user.avatar || "",
        activity.name,
        activity.type,
      );

      console.log(`\n[ACTIVITY STARTED] ${username} (${userId})`);
      console.log(`  Activity: ${activity.name}`);
      console.log(`  Type: ${activity.type}`);

      if (activity.details) {
        console.log(`  Details: ${activity.details}`);
      }

      if (activity.state) {
        console.log(`  State: ${activity.state}`);
      }

      console.log(`  Started at: ${new Date().toISOString()}`);

      // Check if this creates or joins a group session
      if (sessionType === "group") {
        if (wasAlreadyGroup) {
          console.log("  🎮 Joined existing group session!");
        } else {
          console.log("  🎮 Group session created!");
        }

        // Show who else is in the session
        const groupUsers = await getGroupSessionUsers(
          activity.name,
          activity.type,
        );
        const otherUsers = groupUsers.filter((u) => u.userId !== userId);
        if (otherUsers.length > 0) {
          console.log(
            `  Playing with: ${otherUsers.map((u) => u.username).join(", ")}`,
          );
        }
      } else {
        console.log("  Session type: Solo");
      }
    }
  }
}
