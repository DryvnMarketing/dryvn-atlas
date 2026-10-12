// Official Freelancer.com API client (https://developers.freelancer.com)
// Auth: OAuth2 bearer token — generate one at freelancer.com → Settings → Developers,
// then set FREELANCER_OAUTH_TOKEN in .env.local.
// Without a token Atlas runs in demo mode (seeded sample projects, no live calls).

const BASE = process.env.FREELANCER_API_BASE ?? "https://www.freelancer.com/api";

function token(): string | undefined {
  return process.env.FREELANCER_OAUTH_TOKEN;
}

export function isLive(): boolean {
  return !!token();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "freelancer-oauth-v1": token()!,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Freelancer API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.result as T;
}

export interface FLProject {
  id: number;
  title: string;
  preview_description: string;
  description?: string;
  type?: "fixed" | "hourly";
  budget: { minimum: number; maximum?: number };
  currency: { code: string; sign?: string; exchange_rate?: number };
  jobs?: { name: string }[];
  submitdate: number; // unix seconds
  time_submitted?: number;
  seo_url: string;
  language?: string;
  bidperiod?: number;
  bid_stats?: { bid_count?: number; bid_avg?: number };
  is_escrow_project?: boolean;
  hourly_project_info?: { commitment?: { hours?: number; interval?: string } };
  upgrades?: {
    featured?: boolean; sealed?: boolean; NDA?: boolean; urgent?: boolean; pf_only?: boolean;
  };
}

export interface FeedQuery {
  query?: string;
  type?: "fixed" | "hourly" | "all";
  limit?: number;
  offset?: number;
  minBudget?: number; // in project currency
  maxBudget?: number;
  skillIds?: number[];
}

function projectParams(opts: FeedQuery): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 20),
    offset: String(opts.offset ?? 0),
    full_description: "true",
    job_details: "true",
    sort_field: "time_submitted",
    project_types: opts.type && opts.type !== "all" ? opts.type : "fixed,hourly",
    "languages[]": "en",
  });
  if (opts.query) params.set("query", opts.query);
  if (opts.minBudget) params.set("min_avg_price", String(opts.minBudget));
  if (opts.maxBudget) params.set("max_avg_price", String(opts.maxBudget));
  for (const id of opts.skillIds ?? []) params.append("jobs[]", String(id));
  return params;
}

/** Search active projects in the given budget band (fixed-price, USD-ish). */
export async function searchProjects(opts: {
  query?: string;
  minBudget: number;
  maxBudget: number;
  limit?: number;
}): Promise<FLProject[]> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 50),
    "full_description": "true",
    "job_details": "true",
    min_avg_price: String(opts.minBudget),
    max_avg_price: String(opts.maxBudget),
    project_types: "fixed",
    sort_field: "time_updated",
  });
  if (opts.query) params.set("query", opts.query);
  const result = await api<{ projects: FLProject[] }>(
    `/projects/0.1/projects/active/?${params.toString()}`
  );
  return result.projects ?? [];
}

/** Live project feed (newest first) for the Feed page — fixed and hourly. */
export async function fetchFeed(opts: FeedQuery): Promise<{ projects: FLProject[]; total: number }> {
  const result = await api<{ projects: FLProject[]; total_count?: number }>(
    `/projects/0.1/projects/active/?${projectParams(opts).toString()}`
  );
  return { projects: result.projects ?? [], total: result.total_count ?? 0 };
}

/** One project with full detail (used by the bid editor + Quick Bid). */
export async function getProject(projectId: number): Promise<FLProject> {
  const params = new URLSearchParams({ full_description: "true", job_details: "true" });
  return api<FLProject>(`/projects/0.1/projects/${projectId}/?${params.toString()}`);
}

/** Place a bid on a project. */
export async function placeBid(opts: {
  projectId: number;
  bidderId: number; // our Freelancer user id (FREELANCER_USER_ID)
  amount: number;
  periodDays: number;
  description: string;
}): Promise<{ id: number }> {
  return api<{ id: number }>(`/projects/0.1/bids/`, {
    method: "POST",
    body: JSON.stringify({
      project_id: opts.projectId,
      bidder_id: opts.bidderId,
      amount: opts.amount,
      period: opts.periodDays,
      milestone_percentage: 50,
      description: opts.description,
    }),
  });
}

export interface FLBid {
  id: number;
  bidder_id: number;
  project_id: number;
  amount: number;
  period: number;
}

/** Fetch existing bids on a project, for competitive pricing. */
export async function getProjectBids(projectId: number): Promise<FLBid[]> {
  const params = new URLSearchParams({ limit: "100" });
  params.append("projects[]", String(projectId));
  const result = await api<{ bids: FLBid[] }>(`/projects/0.1/bids/?${params.toString()}`);
  return result.bids ?? [];
}

export interface FLThread {
  id: number;
  context?: { type?: string; id?: number };
  members?: number[];
  time_updated?: number;
}

export interface FLMessage {
  id: number;
  from_user: number;
  message: string;
  time_created: number;
}

/** Fetch message threads for our account (with member user details). */
export async function getThreads(): Promise<{
  threads: FLThread[];
  users: Record<string, { username?: string; display_name?: string }>;
}> {
  const result = await api<{
    threads: (FLThread & { thread?: FLThread })[];
    users?: Record<string, { username?: string; display_name?: string }>;
  }>(`/messages/0.1/threads/?last_message=true&user_details=true&limit=30`);
  // Some responses nest the thread object; normalize.
  const threads = (result.threads ?? []).map((t) => ({ ...(t.thread ?? t), id: t.id ?? t.thread?.id }));
  return { threads: threads as FLThread[], users: result.users ?? {} };
}

/** Fetch messages in a thread, oldest first. */
export async function getThreadMessages(threadId: number): Promise<FLMessage[]> {
  const params = new URLSearchParams({ limit: "100" });
  params.append("threads[]", String(threadId));
  const result = await api<{ messages: FLMessage[] }>(
    `/messages/0.1/messages/?${params.toString()}`
  );
  return (result.messages ?? []).sort((a, b) => a.time_created - b.time_created);
}

/** Send a message in a thread (form-encoded per Freelancer messaging API). */
export async function sendMessage(threadId: number, message: string) {
  const res = await fetch(`${BASE}/messages/0.1/threads/${threadId}/messages/`, {
    method: "POST",
    headers: {
      "freelancer-oauth-v1": token()!,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ message }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Freelancer API ${res.status} sending message: ${body.slice(0, 300)}`);
  }
  return res.json();
}
