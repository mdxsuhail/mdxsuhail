// Commit Metro generator: builds an animated metro-map SVG from your GitHub repos.
// Usage:  GITHUB_USER=mdxsuhail GITHUB_TOKEN=xxx node generate.js
//         node generate.js --mock      (offline preview with sample data)
// Needs Node 18+ (built-in fetch). No dependencies.

const fs = require("fs");

const USER = process.env.GITHUB_USER || "mdxsuhail";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUT = process.env.OUT || "metro.svg";
const MOCK = process.argv.includes("--mock");

const W = 729, H = 412, HUB = { x: 365, y: 232 };
const MAX_LINES = 8, MAX_STOPS = 3;

const COLORS = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", "C++": "#f34b7d", C: "#8a8a8a",
  Python: "#3572A5", "Jupyter Notebook": "#DA5B0B", HTML: "#e34c26", CSS: "#a56de2",
  Java: "#b07219", Go: "#00ADD8", Rust: "#dea584", Kotlin: "#A97BFF", Dart: "#00B4AB",
  Shell: "#89e051", PHP: "#4F5D95", Ruby: "#cc342d", Swift: "#F05138", Vue: "#41b883",
};
const FALLBACK = ["#ff4d8d", "#3b82f6", "#f59e0b", "#10b981", "#a855f7", "#ef4444"];

// Slots interleave left/right so the map stays balanced however many languages you have.
// side: L/R, y: height of the horizontal run.
const SLOTS = [
  { side: "L", y: 112 }, { side: "R", y: 145 }, { side: "L", y: 310 }, { side: "R", y: 315 },
  { side: "L", y: 160 }, { side: "R", y: 200 }, { side: "L", y: 355 }, { side: "R", y: 270 },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function gh(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "commit-metro", Accept: "application/vnd.github+json", ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res;
}

async function loadData() {
  if (MOCK) {
    const mk = (language, names) => names.map((name) => ({ name, language, fork: false, stargazers_count: 0, pushed_at: "2026-01-01" }));
    return {
      avatar: null,
      repos: [
        ...mk("TypeScript", ["luna"]), ...mk("C++", ["ATmega328P-Digital", "ATmega328P-Smart"]),
        ...mk("JavaScript", ["route-velo", "hugging-Ai-bot"]), ...mk("Jupyter Notebook", ["JEE-kcet-comdk", "SB-MED-Biomark", "ml-notes"]),
      ],
    };
  }
  const user = await (await gh(`https://api.github.com/users/${USER}`)).json();
  let avatar = null;
  try {
    const buf = Buffer.from(await (await fetch(user.avatar_url + "&s=120")).arrayBuffer());
    avatar = "data:image/png;base64," + buf.toString("base64");
  } catch {}
  const repos = await (await gh(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner&sort=pushed`)).json();
  return { avatar, repos };
}

function group(repos) {
  const by = {};
  for (const r of repos) {
    if (r.fork || !r.language || r.name === USER) continue;
    (by[r.language] ||= []).push(r);
  }
  return Object.entries(by)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_LINES)
    .map(([lang, rs]) => ({
      lang,
      stops: rs.sort((a, b) => b.stargazers_count - a.stargazers_count || (b.pushed_at > a.pushed_at ? 1 : -1)).slice(0, MAX_STOPS).map((r) => r.name),
    }));
}

function build({ avatar, repos }) {
  const lines = group(repos);
  let out = "";
  let defs = "";
  let fi = 0;

  lines.forEach((ln, i) => {
    const slot = SLOTS[i];
    const color = COLORS[ln.lang] || FALLBACK[fi++ % FALLBACK.length];
    const L = slot.side === "L";
    const dy = Math.abs(slot.y - HUB.y);
    const diagX = HUB.x + (L ? -1 : 1) * dy * 0.55;
    const label = ln.lang.toUpperCase();
    const pillW = Math.round(34 + label.length * 7);
    const pillX = L ? 28 : W - 28 - pillW;
    const endX = L ? pillX + pillW - 14 : pillX + 14;
    const id = `p${i}`;
    const d = `M${HUB.x},${HUB.y} L${diagX.toFixed(1)},${slot.y} L${endX},${slot.y}`;

    defs += `<path id="${id}" d="${d}"/>`;
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;

    out += `<rect x="${pillX}" y="${slot.y - 11}" width="${pillW}" height="22" rx="11" fill="${color}"/>`;
    out += `<text x="${pillX + pillW / 2}" y="${slot.y + 4}" class="pill" text-anchor="middle" fill="${ln.lang === "JavaScript" ? "#222" : "#fff"}">${esc(label)}</text>`;

    const a = (L ? endX + 38 : diagX + 38), b = (L ? diagX - 38 : endX - 38);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const maxFit = Math.max(1, Math.floor((hi - lo) / 90) + 1);
    const names = ln.stops.slice(0, maxFit);
    names.forEach((n, k) => {
      const x = names.length === 1 ? (lo + hi) / 2 : lo + (k * (hi - lo)) / (names.length - 1);
      out += `<circle cx="${x.toFixed(1)}" cy="${slot.y}" r="8" fill="#0d1117" stroke="${color}" stroke-width="4">` +
        `<animate attributeName="r" values="8;10;8" dur="3s" begin="${(i * 0.4 + k * 0.7).toFixed(1)}s" repeatCount="indefinite"/></circle>`;
      out += `<text x="${x.toFixed(1)}" y="${slot.y - 17}" class="stop" text-anchor="middle">${esc(trunc(n, 15))}</text>`;
    });

    const dur = 7 + (i % 4) * 1.3;
    for (const [off, op] of [[0, 1], [dur / 2, 0.55]]) {
      out += `<rect x="-9" y="-5" width="18" height="10" rx="5" fill="#fff" opacity="${op}">` +
        `<animateMotion dur="${dur}s" begin="-${off}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;1;0" keyTimes="0;0.5;1">` +
        `<mpath href="#${id}"/></animateMotion></rect>`;
    }
  });

  const hub = `
    <circle cx="${HUB.x}" cy="${HUB.y}" r="24" fill="none" stroke="#39d353" stroke-width="2">
      <animate attributeName="r" values="24;34;24" dur="3s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.9;0;0.9" dur="3s" repeatCount="indefinite"/>
    </circle>
    <circle cx="${HUB.x}" cy="${HUB.y}" r="22" fill="#0d1117" stroke="#39d353" stroke-width="2"/>
    ${avatar ? `<clipPath id="av"><circle cx="${HUB.x}" cy="${HUB.y}" r="18"/></clipPath>
    <image href="${avatar}" x="${HUB.x - 18}" y="${HUB.y - 18}" width="36" height="36" clip-path="url(#av)"/>` : `<circle cx="${HUB.x}" cy="${HUB.y}" r="14" fill="#39d353"/>`}
    <rect x="${HUB.x - 40}" y="${HUB.y + 26}" width="80" height="20" rx="10" fill="#0d1117"/>
    <text x="${HUB.x}" y="${HUB.y + 40}" class="user" text-anchor="middle">@${esc(USER)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Commit metro for ${esc(USER)}">
<style>
  text{font-family:'Segoe UI',Ubuntu,'Helvetica Neue',Arial,sans-serif}
  .kicker{font-size:10px;letter-spacing:2px;fill:#39d353;font-family:monospace}
  .title{font-size:20px;font-weight:700;fill:#fff}
  .pill{font-size:10px;font-weight:700;letter-spacing:.5px}
  .stop{font-size:10px;font-weight:600;fill:#e6edf3}
  .user{font-size:12px;font-weight:700;fill:#fff}
</style>
<defs>${defs}</defs>
<rect width="${W}" height="${H}" rx="10" fill="#0d1117"/>
<text x="58" y="55" class="kicker">COMMIT METRO</text>
<text x="58" y="78" class="title">Every line is a language, every stop a project</text>
${out}
${hub}
</svg>`;
}

(async () => {
  const svg = build(await loadData());
  fs.writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
})().catch((e) => { console.error(e); process.exit(1); });
