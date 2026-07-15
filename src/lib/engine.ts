import { getDb, logActivity } from "./db";
import { getSettings, checkCapacity, inBidWindow } from "./governor";
import { assessFit } from "./agents/scout";
import { draftBid } from "./agents/bid-writer";
import * as freelancer from "./freelancer";
import type { FreelancerProject } from "./types";

const FIT_THRESHOLD = 55;

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
 * 4. Draft bids for good fits → queue as pending_approval
 *    (auto-place only when settings.autoBid is on AND governor allows)
 */
export async function runScoutCycle(): Promise<EngineRunResult> {
  const db = getDb();
  const s = getSettings();
  const skills: string[] = JSON.parse(s.skills);
  const live = freelancer.isLive();
  const notes: string[] = [];
  let discovered = 0, evaluated = 0, drafted = 0, skipped = 0;

  const incoming = live
    ? await fetchLiveProjects(s.bidMinUsd, s.bidMaxUsd, skills)
    : demoProjects();
  if (!live) notes.push("Demo mode: no FREELANCER_OAUTH_TOKEN set — using sample projects.");

  const insert = db.prepare(
    `INSERT OR IGNORE INTO projects
      (externalId, title, description, budgetMin, budgetMax, currency, skills, postedAt, url, status)
     VALUES (@externalId, @title, @description, @budgetMin, @budgetMax, @currency, @skills, @postedAt, @url, 'discovered')`
  );
  for (const p of incoming) {
    const res = insert.run(p);
    if (res.changes > 0) discovered++;
  }
  logActivity("scout", "cycle_discover", `${discovered} new projects discovered`);

  const fresh = db
    .prepare("SELECT * FROM projects WHERE status = 'discovered'")
    .all() as FreelancerProject[];

  for (const project of fresh) {
    if (!inBidWindow(project.budgetMin, project.budgetMax)) {
      db.prepare("UPDATE projects SET status = 'skipped', fitReason = ? WHERE id = ?")
        .run(`Outside month-1 bid window ($${s.bidMinUsd}–$${s.bidMaxUsd})`, project.id);
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
    const bid = await draftBid({ ...project, estimatedDays: fit.estimatedDays });
    // The bid window caps what we charge, not just which projects we enter.
    const amount = Math.min(bid.amount, s.bidMaxUsd);
    const status = s.autoBid && capacity.canBid ? "approved" : "pending_approval";
    db.prepare(
      "INSERT INTO bids (projectId, amount, periodDays, proposal, status) VALUES (?, ?, ?, ?, ?)"
    ).run(project.id, amount, bid.periodDays, bid.proposal, status);
    db.prepare("UPDATE projects SET status = 'bidding' WHERE id = ?").run(project.id);
    drafted++;
    logActivity("bid", "draft", `$${bid.amount} / ${bid.periodDays}d on "${project.title}" → ${status}`);
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

async function fetchLiveProjects(min: number, max: number, skills: string[]) {
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
  return results.map((p) => ({
    externalId: p.id,
    title: p.title,
    description: p.description ?? p.preview_description ?? "",
    budgetMin: p.budget.minimum,
    budgetMax: p.budget.maximum ?? p.budget.minimum,
    currency: p.currency.code,
    skills: JSON.stringify((p.jobs ?? []).map((j) => j.name)),
    postedAt: new Date(p.submitdate * 1000).toISOString(),
    url: `https://www.freelancer.com/projects/${p.seo_url}`,
  }));
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
