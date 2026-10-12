// Domain types for Atlas BPO

export type ProjectStatus =
  | "discovered" // scout found it
  | "evaluated" // scored, decision made
  | "skipped" // below fit threshold or outside guardrails
  | "bidding" // bid drafted / placed
  | "awarded" // client awarded us — awaiting user acceptance
  | "active" // user accepted; in delivery
  | "delivered"
  | "closed";

export type BidStatus =
  | "draft" // Claude wrote it, not yet reviewed
  | "pending_approval" // queued for user approval
  | "approved" // user approved, awaiting placement
  | "placed" // live on Freelancer
  | "rejected" // user rejected the draft
  | "retracted"
  | "won"
  | "lost";

export interface FreelancerProject {
  id: number;
  externalId: number | null; // Freelancer.com project id
  title: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  skills: string; // JSON array of skill names
  postedAt: string;
  url: string;
  projectType: "fixed" | "hourly";
  exchangeRate: number; // 1 unit of project currency in USD
  bidCount: number | null;
  bidAvg: number | null;
  language: string;
  flags: string; // JSON ProjectFlags
  fitScore: number | null; // 0-100 from scout evaluation
  fitReason: string | null;
  estimatedDays: number | null; // agent's delivery estimate
  status: ProjectStatus;
  createdAt: string;
}

/** Bid-blocking / bid-affecting traits the Freelancer API reports per project. */
export interface ProjectFlags {
  pfOnly?: boolean; // Preferred Freelancers only
  escrow?: boolean; // needs a linked Escrow.com account
  nda?: boolean;
  sealed?: boolean;
  featured?: boolean;
  urgent?: boolean;
  hourlyHours?: number; // weekly commitment on hourly projects
}

export interface Script {
  id: number;
  title: string;
  instructions: string;
  wordCount: number;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
}

export interface ScriptStats extends Script {
  sends: number;
  replies: number;
  replyRate: number; // 0-100
  lastUsed: string | null;
}

export interface PortfolioItem {
  id: number;
  title: string;
  description: string;
  skills: string; // JSON array
  link: string;
}

export interface PeriodRule {
  id: number;
  lowerUsd: number;
  upperUsd: number;
  days: number;
}

export interface Bid {
  id: number;
  scriptId: number | null;
  repliedAt: string | null;
  projectId: number;
  amount: number;
  periodDays: number;
  proposal: string;
  status: BidStatus;
  placedAt: string | null;
  createdAt: string;
}

export interface Thread {
  id: number;
  projectId: number;
  externalThreadId: number | null;
  clientName: string;
  lastMessageAt: string;
}

export interface Message {
  id: number;
  threadId: number;
  direction: "inbound" | "outbound";
  body: string;
  status: "draft" | "pending_approval" | "sent" | "received";
  sentAt: string;
}

export interface Settings {
  bidMinUsd: number; // month-1 rule: 150
  bidMaxUsd: number; // month-1 rule: 600
  maxConcurrentProjects: number; // 3
  smallProjectMinUsd: number; // 200
  smallProjectMaxUsd: number; // 300
  smallProjectCap: number; // up to 5 small projects
  smallProjectWindowDays: number; // if all deliverable within 5 days
  autoBid: boolean; // false = approval gate (default)
  autoReply: boolean; // false = approval gate (default)
  skills: string; // JSON array of service categories we sell
  pricePct: number; // default bid = this % of the client's max budget
  minFixedUsd: number; // skip fixed projects whose max budget is below this (USD-equivalent)
  minHourlyUsd: number; // skip hourly projects whose max rate is below this (USD-equivalent)
  attachPortfolio: boolean; // weave matching portfolio items into proposals
  abTestScripts: boolean; // rotate auto-bids across all active scripts
}

export interface ActivityEntry {
  id: number;
  at: string;
  agent: "scout" | "bid" | "comms" | "pitch" | "governor" | "user";
  action: string;
  detail: string;
}
