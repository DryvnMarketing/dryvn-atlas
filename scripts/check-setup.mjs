// Validates the keys in .env.local before Atlas goes live.
// Usage: node scripts/check-setup.mjs   (run from the repo root)
import { readFileSync } from "fs";

const env = {};
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  console.error("✗ .env.local not found — run from the repo root.");
  process.exit(1);
}

let ok = true;

// --- Anthropic ---
if (!env.ANTHROPIC_API_KEY) {
  console.log("✗ ANTHROPIC_API_KEY is empty");
  ok = false;
} else {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
  });
  if (res.ok) {
    console.log("✓ Anthropic key valid — agents will write tailored proposals");
  } else {
    console.log(`✗ Anthropic key rejected (HTTP ${res.status}) — check the key and account credits`);
    ok = false;
  }
}

// --- Freelancer ---
if (!env.FREELANCER_OAUTH_TOKEN) {
  console.log("✗ FREELANCER_OAUTH_TOKEN is empty");
  ok = false;
} else {
  const base = env.FREELANCER_API_BASE || "https://www.freelancer.com/api";
  const res = await fetch(`${base}/users/0.1/self/`, {
    headers: { "freelancer-oauth-v1": env.FREELANCER_OAUTH_TOKEN },
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.result) {
    const u = body.result;
    console.log(`✓ Freelancer token valid — logged in as @${u.username} (id ${u.id})`);
    if (String(env.FREELANCER_USER_ID) !== String(u.id)) {
      console.log(`  → set FREELANCER_USER_ID=${u.id} in .env.local`);
    } else {
      console.log("✓ FREELANCER_USER_ID matches");
    }
  } else {
    console.log(`✗ Freelancer token rejected (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
    ok = false;
  }
}

console.log(ok ? "\nAll good — restart the dev server and run a scout cycle." : "\nFix the items above, then re-run this script.");
