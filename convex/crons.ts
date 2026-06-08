import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "rewrite compact BridgeCrux memories",
  "0 8 * * *",
  internal.memory.rewriteAllMemories,
  {},
);

export default crons;
