import { getDb, logActivity } from "./db";
import { getSettings, checkCapacity, inBidWindow } from "./governor";
import { assessFit } from "./agents/scout";
import { prepareBid, placeLive, recordBid } from "./bidder";
import { pickScript } from "./scripts";
import { ALLOWED_CURRENCIES, bidBlockers, normalizeProject, upsertProject, type NormalizedProject } from "./feed";
import { priceForThirdCheapest, priceFromBudget } from "./pricing";
import * as freelancer from "./freelancer";
import type { FreelancerProject, ProjectFlags } from "./types";

const FIT_THRESHOLD = 55;

// Review-building volume push: in this band, price to land 3rd cheapest
// (visibly affordable, not the single lowest bid) instead of the normal
// value-anchored price, so the profile actually gets looked at.
const RANK_PRICING_BAND = { min: 20, max: 80 };

// Auto-bid only fires inside this fit-score band — strong, confident matches.
// Below it we're not sure enough to skip review; above it (rare) still gets
// a human look since it's usually an unusual/high-value scope.
const AUTO_BID_SCORE_MIN = 70;
const AUTO_BID_SCORE_MAX = 95;

export interface EngineRunResult {
  discovered: number;
  evaluated: number;
  drafted: number;
  skipped: number;
  mode: "live" | "demo";
  notes: string[];
}

/**
 * One scout cycle:
 * 1. Pull fresh projects (Freelancer API, or demo samples without a token)
 * 2. Filter to the month-1 budget window
 * 3. Score fit; skip below threshold
 * 4. Draft bids for good fits → queue as pending_approval, unless
 *    settings.autoBid is on AND fit score lands in the auto-bid band
 *    (AUTO_BID_SCORE_MIN–AUTO_BID_SCORE_MAX), in which case place it live
 *    immediately.
 */
export async function runScoutCycle(): Promise<EngineRunResult> {
  const db = getDb();
  const s = getSettings();
  const skills: string[] = JSON.parse(s.skills);
  const live = freelancer.isLive();
  const notes: string[] = [];
  let discovered = 0, evaluated = 0, drafted = 0, skipped = 0;

  if (!live) notes.push("Demo mode: no FREELANCER_OAUTH_TOKEN set — using sample projects.");

  if (live) {
    const exists = db.prepare("SELECT 1 FROM projects WHERE externalId = ?");
    for (const p of await fetchLiveProjects(s.bidMinUsd, s.bidMaxUsd, skills)) {
      const known = !!exists.get(p.externalId);
      upsertProject(p);
      if (!known) discovered++;
    }
  } else {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO projects
        (externalId, title, description, budgetMin, budgetMax, currency, skills, postedAt, url, status)
       VALUES (@externalId, @title, @description, @budgetMin, @budgetMax, @currency, @skills, @postedAt, @url, 'discovered')`
    );
    for (const p of demoProjects()) {
      if (insert.run(p).changes > 0) discovered++;
    }
  }
  logActivity("scout", "cycle_discover", `${discovered} new projects discovered`);

  const fresh = db
    .prepare("SELECT * FROM projects WHERE status = 'discovered'")
    .all() as FreelancerProject[];

  for (const project of fresh) {
    if (!ALLOWED_CURRENCIES.has(project.currency)) {
      db.prepare("UPDATE projects SET status = 'skipped', fitReason = ? WHERE id = ?")
        .run(`Currency ${project.currency} not in USD/EUR/GBP/AUD`, project.id);
      skipped++;
      continue;
    }
    if (!inBidWindow(project.budgetMin, project.budgetMax)) {
      db.prepare("UPDATE projects SET status = 'skipped', fitReason = ? WHERE id = ?")
        .run(`Outside month-1 bid window ($${s.bidMinUsd}–$${s.bidMaxUsd})`, project.id);
      skipped++;
      continue;
    }
    // Skip what Freelancer would reject anyway (Preferred-only, non-English) or
    // what is under the user's minimums — before spending a Claude call on it.
    const blocked = bidBlockers(
      {
        flags: safeFlags(project.flags),
        language: project.language,
        projectType: project.projectType,
        budgetMax: project.budgetMax,
        exchangeRate: project.exchangeRate,
      },
      s
    ).filter((b) => b.level === "block");
    if (blocked.length) {
      db.prepare("UPDATE projects SET status = 'skipped', fitReason = ? WHERE id = ?")
        .run(blocked.map((b) => b.text).join("; "), project.id);
      skipped++;
      continue;
    }

    const fit = await assessFit(project, skills, {
      bidMin: s.bidMinUsd,
      bidMax: s.bidMaxUsd,
      buildingReviews: s.bidMaxUsd <= 300, // small-window months = review-building mode
    });
    evaluated++;
    db.prepare(
      "UPDATE projects SET fitScore = ?, fitReason = ?, estimatedDays = ?, status = ? WHERE id = ?"
    ).run(
      fit.fitScore,
      fit.fitReason,
      fit.estimatedDays,
      fit.fitScore >= FIT_THRESHOLD ? "evaluated" : "skipped",
      project.id
    );
    if (fit.fitScore < FIT_THRESHOLD) {
      skipped++;
      continue;
    }

    const capacity = checkCapacity(project.budgetMax);

    // Decide pricing BEFORE drafting the proposal, so the written text and the
    // submitted amount always agree (a post-hoc override left them mismatched
    // before: proposal mentioning the client's real budget while the bid
    // amount had been silently dropped to a rank-priced figure).
    // Containment, not overlap: a project's displayed range is a Freelancer
    // budget *bucket* (e.g. "$30–$250"), so a loose overlap check against
    // RANK_PRICING_BAND caught real $150-average jobs just because the
    // bucket's low end touched $80. Only apply aggressive rank pricing when
    // the project's own ceiling actually sits inside the small-job band.
    const inRankBand = project.budgetMax <= RANK_PRICING_BAND.max;
    let priceOverride: number | undefined;
    let pricingNote = "";
    if (live && inRankBand && project.externalId) {
      try {
        const rivals = await freelancer.getProjectBids(project.externalId);
        const rivalAmounts = rivals.map((b) => b.amount);
        priceOverride = priceForThirdCheapest(rivalAmounts, project.budgetMin, project.budgetMax);
        pricingNote = ` (rank-priced vs ${rivalAmounts.length} rival bid${rivalAmounts.length === 1 ? "" : "s"}, targeting 3rd cheapest)`;
      } catch {
        // Bids fetch failed — fall back to normal value-anchored pricing.
      }
    }

    // Price: rank price (small jobs) else the configured % of the client's budget,
    // never above the bid window. The script decides how the proposal is written.
    const baseAmount = priceOverride ?? priceFromBudget(project.budgetMin, project.budgetMax, s.pricePct);
    const amount = Math.min(baseAmount, s.bidMaxUsd);
    const script = pickScript(s.abTestScripts);
    const bid = await prepareBid(
      {
        title: project.title,
        description: project.description,
        budgetMin: project.budgetMin,
        budgetMax: project.budgetMax,
        currency: project.currency,
        exchangeRate: project.exchangeRate,
        projectType: project.projectType,
        skills: JSON.parse(project.skills || "[]"),
        hourlyHours: safeFlags(project.flags).hourlyHours,
        estimatedDays: fit.estimatedDays,
      },
      { script, amountOverride: amount }
    );

    const eligibleForAutoBid =
      s.autoBid &&
      capacity.canBid &&
      fit.fitScore >= AUTO_BID_SCORE_MIN &&
      fit.fitScore <= AUTO_BID_SCORE_MAX;

    let status: "placed" | "pending_approval" = "pending_approval";
    let placeNote = "";
    if (eligibleForAutoBid && live && project.externalId && process.env.FREELANCER_USER_ID) {
      try {
        await placeLive(project.externalId, bid.amount, bid.periodDays, bid.proposal);
        status = "placed";
        placeNote = ` → auto-placed live (fit ${Math.round(fit.fitScore)}, script "${script.title}")`;
      } catch (err) {
        placeNote = ` → auto-place failed (${String(err).slice(0, 150)}), queued for review instead`;
      }
    }

    recordBid(project.id, { ...bid, scriptId: script.id }, status);
    db.prepare("UPDATE projects SET status = 'bidding' WHERE id = ?").run(project.id);
    drafted++;
    logActivity("bid", "draft", `${bid.amount} ${project.currency} / ${bid.periodDays}${project.projectType === "hourly" ? "h/wk" : "d"} on "${project.title}" → ${status}${pricingNote}${placeNote}`);
    if (!capacity.canAcceptAward) {
      notes.push(`Governor: ${capacity.reason}`);
    }
  }

  logActivity("scout", "cycle_complete", `${evaluated} evaluated, ${drafted} bids drafted, ${skipped} skipped`);
  return { discovered, evaluated, drafted, skipped, mode: live ? "live" : "demo", notes };
}

/**
 * Turn the service catalog into targeted search queries so the pipeline fills
 * with relevant projects instead of a random marketplace sample. Extra alias
 * queries cover common client wording our formal skill names would miss.
 */
function searchQueriesFromSkills(skills: string[]): string[] {
  const aliases = ["website", "logo design", "landing page", "shopify", "wordpress", "react", "dashboard", "web app", "branding", "graphic design"];
  const fromSkills = skills.map((s) => s.replace(/[&/]/g, " ").replace(/\s+/g, " ").trim().toLowerCase());
  return [...new Set([...fromSkills, ...aliases])].slice(0, 14);
}

async function fetchLiveProjects(min: number, max: number, skills: string[]): Promise<NormalizedProject[]> {
  const queries = searchQueriesFromSkills(skills);
  const seen = new Set<number>();
  const results: Awaited<ReturnType<typeof freelancer.searchProjects>> = [];
  for (const query of queries) {
    try {
      const batch = await freelancer.searchProjects({ query, minBudget: min, maxBudget: max, limit: 25 });
      for (const p of batch) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          results.push(p);
        }
      }
    } catch {
      // One failed query shouldn't kill the cycle; the rest still run.
    }
  }
  return results.map(normalizeProject);
}

function safeFlags(raw: string): ProjectFlags {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

/** Sample projects so the whole pipeline is testable before API keys exist. */
function demoProjects() {
  const now = Date.now();
  const mk = (offsetMin: number) => new Date(now - offsetMin * 60000).toISOString();
  return [
    {
      externalId: 900001,
      title: "Landing page for boutique gym (Webflow or custom)",
      description:
        "We need a modern, mobile-first landing page for our gym: hero, class schedule, trainer bios, contact form, and WhatsApp button. Copy and photos provided. Looking for clean design and fast delivery.",
      budgetMin: 150, budgetMax: 300, currency: "USD",
      skills: JSON.stringify(["Website Design", "Landing Pages", "HTML", "CSS"]),
      postedAt: mk(35), url: "https://www.freelancer.com/projects/demo-900001",
    },
    {
      externalId: 900002,
      title: "Logo + brand kit for coffee roastery startup",
      description:
        "New specialty coffee brand needs a logo, color palette, typography choices and social media templates. We want something warm and premium, not corporate.",
      budgetMin: 200, budgetMax: 350, currency: "USD",
      skills: JSON.stringify(["Logo Design", "Brand Identity", "Graphic Design"]),
      postedAt: mk(90), url: "https://www.freelancer.com/projects/demo-900002",
    },
    {
      externalId: 900003,
      title: "Admin dashboard for delivery fleet (React)",
      description:
        "Small courier company needs an internal dashboard: driver list, live job board, basic stats, CSV export. We have a REST API already. React preferred.",
      budgetMin: 400, budgetMax: 600, currency: "USD",
      skills: JSON.stringify(["React", "Dashboards & Admin Panels", "API Integration"]),
      postedAt: mk(140), url: "https://www.freelancer.com/projects/demo-900003",
    },
    {
      externalId: 900004,
      title: "Fix WordPress site hacked with malware ASAP",
      description: "Site redirects to spam. Need cleanup and hardening today.",
      budgetMin: 30, budgetMax: 100, currency: "USD",
      skills: JSON.stringify(["WordPress", "Security"]),
      postedAt: mk(20), url: "https://www.freelancer.com/projects/demo-900004",
    },
    {
      externalId: 900005,
      title: "Build complete Uber clone with AI features",
      description: "Full ride-hailing platform iOS+Android+web with AI matching. Long term.",
      budgetMin: 250, budgetMax: 500, currency: "USD",
      skills: JSON.stringify(["Mobile Apps", "React Native", "Node.js"]),
      postedAt: mk(200), url: "https://www.freelancer.com/projects/demo-900005",
    },
  ];
}
