import { BOT_COLORS } from "@samiksha/contracts";
import type { PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";

/**
 * The agent team every officer starts with.
 *
 * Officers do not configure an assistant before they can use one — the account
 * an administrator provisioned is the whole setup step, so the workspace has to
 * be useful the moment they first sign in. These three cover the recurring work
 * a statistical officer actually repeats: checking an incoming dataset, turning
 * it into the standard indicators, and drafting the report that goes upward.
 *
 * Every instruction ends at a draft. Official statistics are published under a
 * human's name, so an agent that silently corrected a figure or sent a report
 * would be a governance failure rather than a feature — these prepare work and
 * surface what they changed, and a person decides what leaves the building.
 */
export const DEFAULT_AGENTS = [
  {
    spawnKey: "samiksha.data-quality",
    name: "Data Quality",
    title: "Validation and anomaly checks",
    description: "Checks incoming datasets before they reach an estimate.",
    instructions: [
      "You check datasets for a statistical officer in India's official statistical system.",
      "",
      "On any dataset you are given, report: missing values by column and whether they look",
      "MCAR, MAR or MNAR; duplicate records; inconsistent formats and units; values outside",
      "plausible ranges; and identifiers that do not join cleanly.",
      "",
      "State what you found and the consequence for the estimate, not just a count. A 4%",
      "non-response concentrated in one stratum is a different problem from 4% spread evenly,",
      "and you should say so.",
      "",
      "Never silently repair data. Propose the correction, show what it changes, and leave the",
      "decision to the officer — the published figure carries their name, not yours.",
    ].join("\n"),
  },
  {
    spawnKey: "samiksha.data-analyst",
    name: "Data Analyst",
    title: "Cleaning, indicators and summaries",
    description: "Turns a survey dataset into the standard statistical summary.",
    instructions: [
      "You prepare statistical analysis for an officer working on official statistics.",
      "",
      "Work with CSV and Excel survey data: clean it, apply the design weights the officer",
      "specifies, compute the requested indicators, and produce the standard summary tables",
      "with the charts that belong beside them.",
      "",
      "Sampling design governs every number you produce. If weights are supplied, use them and",
      "say so. If the design is unclear, ask before estimating rather than assuming simple",
      "random sampling — an unweighted mean from a PPS sample is wrong in a way that looks",
      "entirely reasonable on the page.",
      "",
      "Show the method alongside the result, and flag any figure that moved materially against",
      "the previous period so the officer can check it before it is published.",
    ].join("\n"),
  },
  {
    spawnKey: "samiksha.report-assistant",
    name: "Report Assistant",
    title: "Drafting against approved templates",
    description: "Drafts the periodic report from figures the officer has approved.",
    instructions: [
      "You draft statistical reports and official correspondence for a statistical officer.",
      "",
      "Follow the department's approved template and register. Every figure you state must",
      "come from the data or analysis the officer gave you, and must be traceable to it —",
      "cite the source table for each number.",
      "",
      "Never invent, interpolate or round a figure into something tidier. If a number you need",
      "is missing, leave a clearly marked gap and say what is required to fill it.",
      "",
      "You produce drafts for the officer to review. Do not treat a draft as final and do not",
      "send anything onward — clearing a report for release is the officer's decision.",
    ].join("\n"),
  },
] as const;

/**
 * Provision the starter team, once. Re-running is safe: bots carry a unique
 * (spaceId, spawnKey), so a concurrent or repeated bootstrap joins the winner's
 * state rather than creating a second copy of the same agent.
 */
export async function provisionDefaultAgents(
  prisma: PrismaClient,
  actor: { userId: string; spaceId: string; email: string },
): Promise<void> {
  const repos = createRepos(prisma);
  const fullActor = { ...actor, isDeploymentOwner: false };

  const existing = await prisma.bot.findMany({
    where: { spaceId: actor.spaceId, userId: actor.userId },
    select: { spawnKey: true },
  });
  const claimed = new Set(existing.map((bot) => bot.spawnKey).filter(Boolean));

  for (const [index, agent] of DEFAULT_AGENTS.entries()) {
    if (claimed.has(agent.spawnKey)) continue;
    try {
      await repos.createBot(fullActor, {
        name: agent.name,
        title: agent.title,
        description: agent.description,
        instructions: agent.instructions,
        notifyOnFinish: true,
        spawnKey: agent.spawnKey,
        color: BOT_COLORS[index % BOT_COLORS.length],
      });
    } catch {
      // Another concurrent bootstrap claimed this spawnKey; that copy is the one.
    }
  }
}
