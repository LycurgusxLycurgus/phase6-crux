import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "rewrite compact BridgeCrux memories",
  "0 8 * * *",
  internal.memory.rewriteAllMemories,
  {},
);

crons.interval(
  "clean expired web login links",
  { hours: 1 },
  internal.webAuth.cleanupExpiredWebLoginLinks,
  {},
);

crons.cron(
  "daily habit morning check-in",
  "0 11 * * *", // 06:00 America/Bogota if Convex cron is UTC.
  internal.habitActions.sendMorningHabitCheckins,
  {},
);

crons.cron(
  "daily habit evening check-in",
  "0 23 * * *", // 18:00 America/Bogota if Convex cron is UTC.
  internal.habitActions.sendEveningHabitCheckins,
  {},
);

export default crons;
