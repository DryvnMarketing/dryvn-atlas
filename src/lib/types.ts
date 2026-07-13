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
  fitScore: number | null; // 0-100 from scout evaluation
  fitReason: string | null;
  estimatedDays: number | null; // agent's delivery estimate
  status: ProjectStatus;
  createdAt: string;
}

export interface Bid {
  id: number;
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
}

export interface ActivityEntry {
  id: number;
  at: string;
  agent: "scout" | "bid" | "comms" | "pitch" | "governor" | "user";
  action: string;
  detail: string;
}
