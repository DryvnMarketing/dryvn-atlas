// Generates branded 1920x1080 portfolio covers for Freelancer.
// Usage: node build.mjs   (requires Chrome; writes covers/*.png)
import { writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const chrome = `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`;
const outDir = path.join(here, "covers");
const tmpDir = path.join(here, "tmp");
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const items = [
  {
    slug: "dryvn-pulse",
    kicker: "SAAS PLATFORM",
    title: "Dryvn Pulse",
    desc: "Multi-tenant SaaS for parts suppliers, dealers & fleet operations — live pipeline, predictive failure analysis, role-based access.",
    stats: [["$45K/yr", "recovered margin per customer"], ["Multi-tenant", "SaaS architecture"]],
    shot: "shots/pulse.png",
    url: "dryvnpulse.com",
  },
  {
    slug: "hss-web",
    kicker: "WEB DESIGN + CRO",
    title: "HSS — Hydraulic Services & Supplies",
    desc: "Full site design and lead-generation funnel for an industrial supplier.",
    stats: [["−38%", "cost per lead"], ["Design + build", "delivered in-house"]],
    shot: "shots/hss-web.png",
    url: "hsspe.co.za",
  },
  {
    slug: "hss-erp",
    kicker: "CUSTOM ERP SYSTEM",
    title: "HSS ERP",
    desc: "Fully custom enterprise resource planning system — stock, quoting, sales, purchasing, reporting and admin in one secure platform.",
    stats: [["6 modules", "fully integrated"], ["100%", "custom built"]],
    shot: "shots/hss-erp.png",
    url: "hsspe.co.za/erp",
  },
  {
    slug: "atlas",
    kicker: "INTERNAL PRODUCT · OPERATIONS DASHBOARD",
    title: "Atlas",
    desc: "Agent-driven operations dashboard with approval workflows, live activity feed and capacity governance. Built and run by DRYVN.",
    stats: [["Realtime", "pipeline & approvals"], ["Next.js", "TypeScript · SQLite"]],
    shot: "shots/atlas.png",
    url: "internal product",
  },
  {
    slug: "dryvn-brand",
    kicker: "BRAND IDENTITY + STUDIO SITE",
    title: "DRYVN",
    desc: "Our own identity system and studio site — motion design, blueprint grid language, conversion-focused copy.",
    stats: [["Identity", "system & guidelines"], ["GSAP", "motion design"]],
    shot: "shots/dryvn-site.png",
    url: "dryvn.co.za",
  },
  {
    slug: "sdlg-social",
    kicker: "BRAND + SOCIAL — SDLG SOUTH AFRICA",
    title: "+280% organic reach.",
    desc: "Social media management for a global construction-equipment brand: 48 posts monthly across 3 platforms, bilingual EN/中文 sales documents in the 'Industrial Iron' design system.",
    stats: [["4.1×", "return on ad spend"], ["48", "posts per month"], ["EN/中文", "bilingual sales docs"]],
    shot: null,
    url: "za.sdlg.com",
  },
  {
    slug: "brandflow",
    kicker: "AI PLATFORM",
    title: "Brandflow",
    desc: "AI-powered social media management: content generation, client approval workflows, automated scheduling and publishing.",
    stats: [["AI", "content generation"], ["Automated", "publishing pipeline"], ["Approval", "client workflows"]],
    shot: null,
    url: "DRYVN product",
  },
];

const page = (it) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Noto+Sans+SC:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden}
body{background:#020C1B;font-family:'Space Grotesk','Noto Sans SC',sans-serif;color:#F0F9FF;position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(59,130,246,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,.07) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 90% 100% at 50% 50%,black 30%,transparent 100%);-webkit-mask-image:radial-gradient(ellipse 90% 100% at 50% 50%,black 30%,transparent 100%)}
.g1{position:absolute;width:1100px;height:900px;left:-300px;top:-350px;background:radial-gradient(circle,rgba(29,78,216,.35),transparent 65%)}
.g2{position:absolute;width:1200px;height:1000px;right:-350px;bottom:-450px;background:radial-gradient(circle,rgba(14,165,233,.2),transparent 65%)}
.wrap{position:relative;height:100%;display:flex;align-items:center;gap:90px;padding:0 110px}
.left{width:${it.shot ? "620px" : "1050px"};flex-shrink:0}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:44px}
.brand .d{font-size:40px;font-weight:700;color:#3B82F6}
.brand .rest{font-size:40px;font-weight:700;color:#F0F9FF;margin-left:-14px}
.kicker{font-family:'Space Mono',monospace;font-size:19px;letter-spacing:.22em;color:#60A5FA;margin-bottom:26px}
h1{font-size:${it.title.length > 14 ? "64px" : "96px"};font-weight:700;letter-spacing:-.02em;line-height:1.04;margin-bottom:30px}
.desc{font-size:25px;line-height:1.5;color:#94A3B8;margin-bottom:48px;max-width:${it.shot ? "600px" : "840px"}}
.chips{display:flex;flex-wrap:wrap;gap:18px}
.chip{background:rgba(5,21,37,.85);border:1px solid rgba(59,130,246,.22);border-radius:14px;padding:20px 28px}
.chip .n{font-family:'Space Mono',monospace;font-weight:700;font-size:30px;color:#93C5FD;white-space:nowrap}
.chip .l{font-size:15px;font-weight:500;color:#94A3B8;letter-spacing:.1em;text-transform:uppercase;margin-top:6px}
.frame{flex:1;background:#071628;border:1px solid rgba(59,130,246,.25);border-radius:18px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.55),0 0 80px rgba(29,78,216,.18)}
.bar{display:flex;align-items:center;gap:10px;padding:16px 22px;background:#041020;border-bottom:1px solid rgba(59,130,246,.15)}
.dot{width:13px;height:13px;border-radius:50%}
.addr{margin-left:14px;flex:1;background:#020C1B;border-radius:8px;padding:8px 18px;font-family:'Space Mono',monospace;font-size:16px;color:#4A6080}
.shotbox{height:760px;overflow:hidden}
.shotbox img{display:block;width:100%;height:auto}
.baseline{position:absolute;left:0;right:0;bottom:0;height:6px;background:linear-gradient(90deg,#1D4ED8,#3B82F6 35%,#0EA5E9 70%,transparent)}
</style></head><body>
<div class="grid"></div><div class="g1"></div><div class="g2"></div>
<div class="wrap">
  <div class="left">
    <div class="brand"><span class="d">D</span><span class="rest">RYVN</span></div>
    <div class="kicker">${it.kicker}</div>
    <h1>${it.title}</h1>
    <div class="desc">${it.desc}</div>
    <div class="chips">${it.stats.map(([n, l]) => `<div class="chip"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("")}</div>
  </div>
  ${it.shot ? `<div class="frame">
    <div class="bar">
      <span class="dot" style="background:#f87171"></span><span class="dot" style="background:#fbbf24"></span><span class="dot" style="background:#34d399"></span>
      <span class="addr">${it.url}</span>
    </div>
    <div class="shotbox"><img src="file:///${here.replace(/\\/g, "/")}/${it.shot}"></div>
  </div>` : ""}
</div>
<div class="baseline"></div>
</body></html>`;

for (const it of items) {
  const html = path.join(tmpDir, `${it.slug}.html`);
  writeFileSync(html, page(it));
  const out = path.join(outDir, `${it.slug}.png`);
  execSync(
    `"${chrome}" --headless=new --disable-gpu --hide-scrollbars --window-size=1920,1080 --virtual-time-budget=10000 --screenshot="${out}" "file:///${html.replace(/\\/g, "/")}"`,
    { stdio: "ignore" }
  );
  console.log("rendered", it.slug);
}
