/** Single-file local GUI. No build step, no CDN — works offline. */
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CYCode</title>
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --border: #30363d;
    --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --yellow: #d29922; --user-bg: #1f2937;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; height: 100vh;
  }
  header {
    display: flex; align-items: center; gap: 12px; padding: 10px 16px;
    border-bottom: 1px solid var(--border); background: var(--panel);
  }
  header .logo { font-weight: 700; color: var(--accent); }
  header .meta { color: var(--dim); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header select {
    margin-left: auto; background: var(--bg); color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px;
  }
  #spin { color: var(--accent); display: none; }
  main { flex: 1; display: flex; overflow: hidden; }
  #chat { flex: 1; overflow-y: auto; padding: 20px clamp(16px, 8vw, 120px); }
  #todos {
    width: 260px; border-left: 1px solid var(--border); background: var(--panel);
    padding: 14px; overflow-y: auto; display: none; font-size: 13px;
  }
  #todos h3 { margin: 0 0 8px; font-size: 12px; color: var(--dim); text-transform: uppercase; }
  #todos .done { color: var(--dim); text-decoration: line-through; }
  #todos .doing { color: var(--accent); }
  .msg { margin: 10px 0; white-space: pre-wrap; word-break: break-word; }
  .user {
    background: var(--user-bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 8px 12px; margin-left: 15%;
  }
  .assistant code, .assistant pre { background: var(--panel); border-radius: 6px; }
  .assistant pre { padding: 10px; overflow-x: auto; border: 1px solid var(--border); }
  .assistant code { padding: 1px 5px; font-size: 13px; }
  .assistant pre code { padding: 0; }
  .notice { color: var(--dim); font-size: 12px; }
  .error { color: var(--red); }
  details.tool {
    border: 1px solid var(--border); border-radius: 8px;
    margin: 6px 0; background: var(--panel); font-size: 13px;
  }
  details.tool summary { padding: 6px 10px; cursor: pointer; color: var(--dim); }
  details.tool summary .dot { margin-right: 6px; }
  details.tool .ok .dot { color: var(--green); }
  details.tool pre {
    margin: 0; padding: 8px 12px; border-top: 1px solid var(--border);
    color: var(--dim); max-height: 280px; overflow: auto; white-space: pre-wrap;
  }
  footer { padding: 12px 16px; border-top: 1px solid var(--border); background: var(--panel); }
  #inputrow { display: flex; gap: 8px; align-items: flex-end; }
  textarea {
    flex: 1; background: var(--bg); color: var(--text); resize: none;
    border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px;
    font: inherit; min-height: 42px; max-height: 200px; outline: none;
  }
  textarea:focus { border-color: var(--accent); }
  button {
    background: var(--accent); border: none; color: #04111f; font-weight: 600;
    border-radius: 8px; padding: 10px 18px; cursor: pointer; font: inherit;
  }
  button.stop { background: var(--red); color: #fff; display: none; }
  #permission {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,.55);
    align-items: center; justify-content: center; z-index: 10;
  }
  #permission .box {
    background: var(--panel); border: 1px solid var(--yellow); border-radius: 12px;
    padding: 20px 24px; max-width: 640px; width: 90%;
  }
  #permission h3 { margin: 0 0 6px; color: var(--yellow); font-size: 14px; }
  #permission .desc { font-family: ui-monospace, monospace; word-break: break-all; margin-bottom: 14px; }
  #permission .row { display: flex; gap: 8px; justify-content: flex-end; }
  #permission .deny { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
  #permission .always { background: var(--panel); color: var(--accent); border: 1px solid var(--accent); }
  .hint { color: var(--dim); font-size: 11px; margin-top: 6px; }
</style>
</head>
<body>
<header>
  <span class="logo">⌬ CYCode</span>
  <span class="meta" id="meta"></span>
  <span id="spin">●</span>
  <select id="mode" title="Permission mode"></select>
</header>
<main>
  <div id="chat"></div>
  <aside id="todos"><h3>Tasks</h3><div id="todolist"></div></aside>
</main>
<footer>
  <div id="inputrow">
    <textarea id="input" placeholder="Ask CYCode… (Enter to send, Shift+Enter for newline, / for skills)"></textarea>
    <button id="send">Send</button>
    <button id="stop" class="stop">Stop</button>
  </div>
  <div class="hint" id="skillhint"></div>
</footer>
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

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function md(s) {
  let h = esc(s);
  h = h.replace(/\\u0060\\u0060\\u0060([\\s\\S]*?)\\u0060\\u0060\\u0060/g,
    (m, code) => "<pre><code>" + code.replace(/^[a-z]*\\n/, "") + "</code></pre>");
  h = h.replace(/\\u0060([^\\u0060\\n]+)\\u0060/g, "<code>$1</code>");
  h = h.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
  return h;
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
  $("spin").style.display = b ? "inline" : "none";
  $("send").style.display = b ? "none" : "inline-block";
  $("stop").style.display = b ? "inline-block" : "none";
}
function renderTodos(todos) {
  $("todos").style.display = todos.length ? "block" : "none";
  $("todolist").innerHTML = todos.map(t => {
    const cls = t.status === "completed" ? "done" : t.status === "in_progress" ? "doing" : "";
    const mark = t.status === "completed" ? "☑" : t.status === "in_progress" ? "◉" : "☐";
    return '<div class="' + cls + '">' + mark + " " + esc(t.content) + "</div>";
  }).join("");
}

const tools = new Map();
function onEvent(ev) {
  switch (ev.type) {
    case "state": {
      $("meta").textContent = ev.cwd + " · " + ev.modelSpec;
      const sel = $("mode");
      sel.innerHTML = ev.modes.map(m =>
        '<option' + (m === ev.mode ? " selected" : "") + ">" + m + "</option>").join("");
      $("skillhint").textContent = ev.skills.length
        ? "Skills: " + ev.skills.map(s => "/" + s.name).join("  ") : "";
      renderTodos(ev.todos || []);
      setBusy(ev.busy);
      break;
    }
    case "user": add("user", esc(ev.text)); break;
    case "turn-start": setBusy(true); break;
    case "turn-end": setBusy(false); streamEl = null; break;
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
      d.className = "tool";
      d.innerHTML = '<summary><span class="dot">⏺</span>' + esc(ev.description) +
        '</summary><pre>running…</pre>';
      chat.appendChild(d);
      tools.set(ev.callId, d);
      chat.scrollTop = chat.scrollHeight;
      streamEl = null;
      break;
    }
    case "tool-end": {
      const d = tools.get(ev.callId);
      if (!d) break;
      d.querySelector("summary").classList.add(ev.ok ? "ok" : "err");
      d.querySelector(".dot").style.color = ev.ok ? "var(--green)" : "var(--red)";
      d.querySelector("pre").textContent =
        ev.output.slice(0, 8000) + (ev.output.length > 8000 ? "\\n…" : "");
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
  post("/api/message", { text });
}
$("send").onclick = send;
$("stop").onclick = () => post("/api/abort");
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
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
