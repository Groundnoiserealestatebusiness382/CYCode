/** Single-file local GUI. No build step, no CDN — works offline. */
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CYCode</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='116' fill='%230d1117'/><g transform='translate(256 256) scale(1.62)' fill='none'><path d='M69.3 -40 L0 -80 L-69.3 -40 L-69.3 40 L0 80 L69.3 40' stroke='%2358a6ff' stroke-width='21' stroke-linecap='round' stroke-linejoin='round'/><rect x='-17' y='-26' width='30' height='52' rx='7' fill='%2358a6ff'/></g></svg>">
<style>
  :root {
    --bg: #0d1117; --panel: #131a26; --raised: #1a2333; --border: #232e44;
    --text: #e6edf3; --dim: #8b949e; --faint: #5b6c8c; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --yellow: #d29922;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14.5px/1.65 -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column;
  }
  ::-webkit-scrollbar { width: 9px; height: 9px; }
  ::-webkit-scrollbar-thumb { background: #2a3650; border-radius: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }

  header {
    display: flex; align-items: center; gap: 12px; padding: 11px 18px;
    border-bottom: 1px solid var(--border); background: var(--panel); flex-shrink: 0;
  }
  .logo { font-weight: 800; font-size: 16px; letter-spacing: -0.3px; display: flex; align-items: center; gap: 8px; }
  .logo b { color: var(--accent); font-weight: 800; }
  .meta { color: var(--faint); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #busy { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); opacity: 0; transition: opacity .2s; }
  #busy.on { opacity: 1; animation: pulse 1.1s infinite; }
  @keyframes pulse { 50% { opacity: .25; } }
  header select {
    margin-left: auto; background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 7px; padding: 5px 9px; font: inherit; font-size: 13px;
  }

  main { flex: 1; display: flex; min-height: 0; }
  aside {
    width: 232px; flex-shrink: 0; border-right: 1px solid var(--border); background: var(--panel);
    display: flex; flex-direction: column; overflow-y: auto; padding: 12px;
  }
  aside h3 { margin: 10px 4px 6px; font-size: 11px; color: var(--faint); text-transform: uppercase; letter-spacing: 1px; }
  .sess {
    padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 12.5px;
    color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sess:hover { background: var(--raised); color: var(--text); }
  .sess.cur { background: var(--raised); color: var(--accent); }
  #todolist { font-size: 13px; padding: 0 4px; }
  #todolist .done { color: var(--faint); text-decoration: line-through; }
  #todolist .doing { color: var(--accent); }
  #todolist div { margin: 3px 0; }

  #chatwrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  #chat { flex: 1; overflow-y: auto; padding: 26px clamp(18px, 6vw, 90px); scroll-behavior: smooth; }
  .msg { margin: 14px 0; word-break: break-word; max-width: 860px; }
  .user {
    background: var(--raised); border-radius: 12px; padding: 9px 14px;
    margin-left: auto; width: fit-content; max-width: 75%; white-space: pre-wrap;
  }
  .assistant p { margin: 8px 0; }
  .assistant h1, .assistant h2, .assistant h3 { margin: 14px 0 6px; line-height: 1.3; }
  .assistant h1 { font-size: 20px; } .assistant h2 { font-size: 17px; } .assistant h3 { font-size: 15px; }
  .assistant ul { margin: 6px 0; padding-left: 22px; }
  .assistant li { margin: 3px 0; }
  .assistant a { color: var(--accent); }
  .assistant code, .assistant pre { background: var(--panel); border-radius: 7px; font-size: 13px; }
  .assistant pre { padding: 11px 13px; overflow-x: auto; border: 1px solid var(--border); margin: 8px 0; }
  .assistant code { padding: 1.5px 6px; }
  .assistant pre code { padding: 0; background: none; }
  .notice { color: var(--faint); font-size: 12.5px; }
  .error { color: var(--red); font-size: 13.5px; }

  details.tool {
    border: 1px solid var(--border); border-radius: 10px;
    margin: 7px 0; background: var(--panel); font-size: 13px; max-width: 860px;
  }
  details.tool summary {
    padding: 7px 12px; cursor: pointer; color: var(--dim); list-style: none;
    display: flex; align-items: center; gap: 8px;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  details.tool summary::before { content: "▸"; color: var(--faint); font-size: 10px; transition: transform .15s; }
  details.tool[open] summary::before { transform: rotate(90deg); }
  details.tool .dot { font-size: 11px; }
  details.tool pre {
    margin: 0; padding: 9px 14px; border-top: 1px solid var(--border); color: var(--dim);
    max-height: 300px; overflow: auto; white-space: pre-wrap; font-size: 12.5px;
  }

  footer { padding: 14px 18px; border-top: 1px solid var(--border); background: var(--panel); flex-shrink: 0; }
  #inputrow { display: flex; gap: 10px; align-items: flex-end; max-width: 980px; margin: 0 auto; }
  textarea {
    flex: 1; background: var(--bg); color: var(--text); resize: none;
    border: 1px solid var(--border); border-radius: 11px; padding: 11px 14px;
    font: inherit; min-height: 46px; max-height: 220px; outline: none; transition: border-color .15s;
  }
  textarea:focus { border-color: var(--accent); }
  button {
    background: var(--accent); border: none; color: #04111f; font-weight: 700;
    border-radius: 10px; padding: 11px 20px; cursor: pointer; font: inherit; font-size: 14px;
  }
  button:hover { filter: brightness(1.12); }
  button.stop { background: var(--red); color: #fff; display: none; }
  .hint { color: var(--faint); font-size: 11.5px; margin: 7px auto 0; max-width: 980px; }

  #permission {
    display: none; position: fixed; inset: 0; background: rgba(4,8,15,.6);
    align-items: center; justify-content: center; z-index: 10; backdrop-filter: blur(2px);
  }
  #permission .box {
    background: var(--panel); border: 1px solid var(--yellow); border-radius: 14px;
    padding: 22px 26px; max-width: 640px; width: 90%; box-shadow: 0 18px 50px rgba(0,0,0,.5);
  }
  #permission h3 { margin: 0 0 8px; color: var(--yellow); font-size: 14px; }
  #permission .desc { font-family: ui-monospace, monospace; word-break: break-all; margin-bottom: 16px; font-size: 13.5px; }
  #permission .row { display: flex; gap: 9px; justify-content: flex-end; }
  #permission .deny { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
  #permission .always { background: var(--panel); color: var(--accent); border: 1px solid var(--accent); }
</style>
</head>
<body>
<header>
  <span class="logo"><svg width="19" height="19" viewBox="-112 -112 224 224" fill="none"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#58a6ff"/><stop offset="1" stop-color="#3fb950"/></linearGradient></defs><path d="M69.3 -40 L0 -80 L-69.3 -40 L-69.3 40 L0 80 L69.3 40" stroke="url(#bm)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><rect x="-17" y="-26" width="30" height="52" rx="7" fill="url(#bm)"/></svg><span>CY<b>Code</b></span></span>
  <span class="meta" id="meta"></span>
  <span id="busy"></span>
  <select id="mode" title="Permission mode"></select>
</header>
<main>
  <aside>
    <h3>Sessions</h3>
    <div id="sessions"></div>
    <h3 id="taskhead" style="display:none">Tasks</h3>
    <div id="todolist"></div>
  </aside>
  <div id="chatwrap">
    <div id="chat"></div>
    <footer>
      <div id="inputrow">
        <textarea id="input" rows="1" placeholder="Ask CYCode…  (Enter to send · Shift+Enter for newline · / for skills)"></textarea>
        <button id="send">Send</button>
        <button id="stop" class="stop">Stop</button>
      </div>
      <div class="hint" id="skillhint"></div>
    </footer>
  </div>
</main>
<div id="permission">
  <div class="box">
    <h3>Permission required</h3>
    <div class="desc" id="permdesc"></div>
    <div class="row">
      <button class="deny" id="permdeny">Deny</button>
      <button class="always" id="permalways">Always allow</button>
      <button id="permallow">Allow</button>
    </div>
  </div>
</div>
<script>
const $ = (id) => document.getElementById(id);
const chat = $("chat");
let streamEl = null;
let permId = null;
const tools = new Map();

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// minimal markdown: code blocks, headers, bullets, bold, inline code, links
function md(src) {
  const blocks = [];
  src = src.replace(/\\u0060\\u0060\\u0060([\\s\\S]*?)\\u0060\\u0060\\u0060/g, (m, code) => {
    blocks.push("<pre><code>" + esc(code.replace(/^[a-zA-Z]*\\n/, "")) + "</code></pre>");
    return "\\u0000" + (blocks.length - 1) + "\\u0000";
  });
  const lines = src.split("\\n");
  let html = "", inList = false, para = [];
  const flush = () => {
    if (para.length) { html += "<p>" + inline(para.join("<br>")) + "</p>"; para = []; }
  };
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const inline = (s) =>
    esc(s).replace(/\\u0060([^\\u0060]+)\\u0060/g, "<code>$1</code>")
      .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
      .replace(/\\[([^\\]]+)\\]\\((https?:[^)\\s]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/&lt;br&gt;/g, "<br>");
  for (const raw of lines) {
    const line = raw.replace(/\\s+$/, "");
    const h = /^(#{1,3})\\s+(.*)$/.exec(line);
    const b = /^[-*]\\s+(.*)$/.exec(line);
    if (h) { flush(); closeList(); html += "<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"; }
    else if (b) { flush(); if (!inList) { html += "<ul>"; inList = true; } html += "<li>" + inline(b[1]) + "</li>"; }
    else if (line === "") { flush(); closeList(); }
    else { closeList(); para.push(line); }
  }
  flush(); closeList();
  return html.replace(/\\u0000(\\d+)\\u0000/g, (m, i) => blocks[+i]);
}

function add(cls, html) {
  const el = document.createElement("div");
  el.className = "msg " + cls;
  el.innerHTML = html;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}
function setBusy(b) {
  $("busy").className = b ? "on" : "";
  $("send").style.display = b ? "none" : "inline-block";
  $("stop").style.display = b ? "inline-block" : "none";
}
function renderTodos(todos) {
  $("taskhead").style.display = todos.length ? "block" : "none";
  $("todolist").innerHTML = todos.map(t => {
    const cls = t.status === "completed" ? "done" : t.status === "in_progress" ? "doing" : "";
    const mark = t.status === "completed" ? "☑" : t.status === "in_progress" ? "◉" : "☐";
    return '<div class="' + cls + '">' + mark + " " + esc(t.content) + "</div>";
  }).join("");
}

async function loadSessions() {
  const r = await fetch("/api/sessions").then(r => r.json()).catch(() => null);
  if (!r) return;
  $("sessions").innerHTML = r.sessions.slice(0, 25).map(s => {
    const d = new Date(s.createdAt);
    const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return '<div class="sess' + (s.id === r.current ? " cur" : "") + '" data-id="' + s.id + '" title="' + s.id + '">' + label + "</div>";
  }).join("");
  for (const el of document.querySelectorAll(".sess")) {
    el.onclick = () => post("/api/session/load", { id: el.dataset.id }).then(loadSessions);
  }
}

function onEvent(ev) {
  switch (ev.type) {
    case "state": {
      let meta = ev.cwd.split("/").pop() + " · " + ev.modelSpec;
      if (ev.usage && (ev.usage.inputTokens || ev.usage.outputTokens)) {
        meta += " · " + (ev.usage.inputTokens / 1000).toFixed(1) + "k in / " +
          (ev.usage.outputTokens / 1000).toFixed(1) + "k out";
      }
      $("meta").textContent = meta;
      const sel = $("mode");
      sel.innerHTML = ev.modes.map(m =>
        '<option' + (m === ev.mode ? " selected" : "") + ">" + m + "</option>").join("");
      $("skillhint").textContent = ev.skills.length
        ? "Skills: " + ev.skills.map(s => "/" + s.name).join("  ") : "";
      renderTodos(ev.todos || []);
      setBusy(ev.busy);
      break;
    }
    case "reset": chat.innerHTML = ""; streamEl = null; tools.clear(); renderTodos([]); break;
    case "user": add("user", esc(ev.text)); streamEl = null; break;
    case "turn-start": setBusy(true); break;
    case "turn-end": setBusy(false); streamEl = null; loadSessions(); fetch("/api/state").then(r => r.json()).then(onEvent); break;
    case "text-delta": {
      if (!streamEl) { streamEl = add("assistant", ""); streamEl.dataset.raw = ""; }
      streamEl.dataset.raw += ev.text;
      streamEl.innerHTML = md(streamEl.dataset.raw);
      chat.scrollTop = chat.scrollHeight;
      break;
    }
    case "text-end": {
      if (streamEl) { streamEl.innerHTML = md(ev.text); streamEl = null; }
      else add("assistant", md(ev.text));
      break;
    }
    case "tool-start": {
      const d = document.createElement("details");
      d.className = "tool msg";
      d.innerHTML = '<summary><span class="dot" style="color:var(--faint)">●</span><span>' +
        esc(ev.description) + "</span></summary><pre>running…</pre>";
      chat.appendChild(d);
      tools.set(ev.callId, d);
      chat.scrollTop = chat.scrollHeight;
      streamEl = null;
      break;
    }
    case "tool-end": {
      const d = tools.get(ev.callId);
      if (!d) break;
      d.querySelector(".dot").style.color = ev.ok ? "var(--green)" : "var(--red)";
      d.querySelector("pre").textContent =
        (ev.output || "(no output)").slice(0, 8000) + (ev.output && ev.output.length > 8000 ? "\\n…" : "");
      break;
    }
    case "tool-denied": {
      const d = tools.get(ev.callId);
      if (d) {
        d.querySelector(".dot").style.color = "var(--yellow)";
        d.querySelector("pre").textContent = "denied: " + ev.reason;
      }
      break;
    }
    case "todos": renderTodos(ev.todos); break;
    case "compaction": add("notice", "Context compacted"); break;
    case "notice": add("notice", esc(ev.message)); break;
    case "error": add("error", esc(ev.message)); break;
    case "permission-request": {
      permId = ev.id;
      $("permdesc").textContent = ev.description;
      $("permission").style.display = "flex";
      break;
    }
  }
}

new EventSource("/api/events").onmessage = (e) => onEvent(JSON.parse(e.data));
loadSessions();

async function post(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}
function send() {
  const text = $("input").value.trim();
  if (!text) return;
  $("input").value = "";
  $("input").style.height = "auto";
  const m = /^\\/model\\s+(\\S+)$/.exec(text);
  if (m) { post("/api/model", { spec: m[1] }); return; }
  post("/api/message", { text });
}
$("send").onclick = send;
$("stop").onclick = () => post("/api/abort");
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});
$("input").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";
});
$("mode").onchange = (e) => post("/api/mode", { mode: e.target.value });
function permRespond(behavior, always) {
  $("permission").style.display = "none";
  post("/api/permission", { id: permId, behavior, always });
}
$("permallow").onclick = () => permRespond("allow", false);
$("permalways").onclick = () => permRespond("allow", true);
$("permdeny").onclick = () => permRespond("deny", false);
</script>
</body>
</html>`;
