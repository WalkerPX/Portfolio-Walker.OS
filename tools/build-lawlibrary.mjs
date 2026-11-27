// Builds Walker's Law Library (/lawlibrary) from the Obsidian vault.
//
//   cd tools && npm run lawlibrary            (or: node build-lawlibrary.mjs [vaultLawSchoolDir])
//
// Reads every Markdown note under "<vault>/Law School", resolves [[wikilinks]] the way Obsidian does
// (path, then note name, then alias), renders each note to HTML once, and writes:
//   lawlibrary/data/manifest.json        courses, orbit groups, notes and the link graph (no note bodies)
//   lawlibrary/data/notes/<course>/<slug>.html   one rendered body per note, fetched when it is opened
//   lawlibrary/<course>/index.html       opens the library zoomed into that course orbit
//   lawlibrary/<course>/<slug>/index.html  the note's standalone page ("Open in new tab")
// Attachments (PDF, DOCX, PPTX) are never copied: links to them render as plain labels.
// The vault is only read, never written.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');
const OUT = path.join(SITE, 'lawlibrary');
const SRC = path.resolve(process.argv[2] || path.join(process.env.HOME, 'Desktop/ObsidianVault/Law School'));
const ROOT_NAME = path.basename(SRC);

// Course order and colours for the top-level orbits. Folders not listed here still get an orbit.
const COURSE_ORDER = ['Contracts', 'Property', 'Torts', 'LCA', 'Legal Research', 'Responsible Lawyering'];
// Glow tones of each course's gem (sapphire, emerald, ruby, amethyst, citrine, aquamarine...), from Rho Network's Classic palette.
const PALETTE = ['#9cc8f0', '#8fd9b6', '#e88b7a', '#b8a8f0', '#efe0b0', '#6fc7c0', '#e89ab8', '#e8b45c'];

if (!fs.existsSync(SRC)) { console.error(`Vault folder not found: ${SRC}`); process.exit(1); }

const slugify = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'note';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const posix = (p) => p.split(path.sep).join('/');

// ---------- read the vault ----------
function walk(dir, out = { files: [], dirs: [] }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { out.dirs.push(full); walk(full, out); } else out.files.push(full);
  }
  return out;
}
const { files, dirs } = walk(SRC);
const rel = (f) => posix(path.relative(SRC, f));

function parseFrontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { fm: {}, body: src };
  const fm = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const li = /^\s+-\s+(.*)$/.exec(line);
    if (li && key) { (Array.isArray(fm[key]) ? fm[key] : (fm[key] = [])).push(unq(li[1])); continue; }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    if (!v) fm[key] = [];
    else if (v.startsWith('[') && v.endsWith(']')) fm[key] = splitList(v.slice(1, -1)).map(unq).filter(Boolean);
    else fm[key] = unq(v);
  }
  return { fm, body: src.slice(m[0].length) };
}
function unq(s) { s = String(s).trim(); return /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s; }
function splitList(s) {
  const out = []; let cur = '', q = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

// Courses = the folders directly inside "Law School", including empty ones.
const courseDirs = dirs.filter((d) => path.dirname(d) === SRC).map((d) => path.basename(d));
courseDirs.sort((a, b) => {
  const ia = COURSE_ORDER.indexOf(a), ib = COURSE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});
const courses = courseDirs.map((name, i) => ({ id: slugify(name), name, color: PALETTE[i % PALETTE.length], hub: null, groups: [], count: 0, attachments: 0 }));
const courseByName = new Map(courses.map((c) => [c.name, c]));

const notes = [];
const byPath = new Map(), byName = new Map(), byAlias = new Map();
for (const f of files) {
  const r = rel(f), parts = r.split('/');
  if (parts.length < 2) continue;                       // loose files at the Law School root have no course
  const course = courseByName.get(parts[0]);
  if (!course) continue;
  if (!r.endsWith('.md')) { if (!/\.(bak|DS_Store)$/i.test(r)) course.attachments++; continue; }
  const raw = fs.readFileSync(f, 'utf8');
  const { fm, body } = parseFrontmatter(raw);
  const title = path.basename(r, '.md');
  const folder = parts.slice(1, -1).join('/');          // folder inside the course ('' = course root)
  const n = { course: course.id, folder, title, path: r, fm, body, slug: '', id: '', links: new Set(), hasCourse: course };
  notes.push(n);
  byPath.set(r.slice(0, -3).toLowerCase(), n);
  byName.set(title.toLowerCase(), n);
  for (const a of [].concat(fm.aliases || fm.alias || [])) if (a) byAlias.set(String(a).toLowerCase(), n);
}

// Slugs are unique inside a course.
for (const c of courses) {
  const used = new Set();
  for (const n of notes.filter((x) => x.course === c.id).sort((a, b) => a.path.localeCompare(b.path))) {
    let s = slugify(n.title), k = 2;
    while (used.has(s)) s = `${slugify(n.title)}-${k++}`;
    used.add(s); n.slug = s; n.id = `${c.id}/${s}`;
  }
}

const attachExt = /\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|svg|mp4|mp3|m4a|csv|zip)$/i;
function resolve(target, from) {
  const t = target.trim().replace(/\\/g, '/').replace(/\.md$/i, '');
  if (!t) return from;
  const lc = t.toLowerCase();
  if (byPath.has(lc)) return byPath.get(lc);
  const fromDir = from ? path.posix.dirname(from.path) : '';
  const relTry = path.posix.normalize(path.posix.join(fromDir, t)).toLowerCase();
  if (byPath.has(relTry)) return byPath.get(relTry);
  const base = lc.split('/').pop();
  // a partial path like "Slides/Foo" or "Contracts/Contracts": match the end of a real path
  if (lc.includes('/')) for (const [p, n] of byPath) if (p.endsWith('/' + lc)) return n;
  return byName.get(base) || byAlias.get(lc) || byAlias.get(base) || null;
}

// ---------- render ----------
const headingId = (text) => slugify(text.replace(/<[^>]+>/g, ''));
const CALLOUT_ALIAS = { tldr: 'summary', abstract: 'summary', hint: 'tip', important: 'tip', caution: 'warning', attention: 'warning', faq: 'question', help: 'question', error: 'danger', bug: 'danger', cite: 'quote', check: 'success', done: 'success' };

function renderNote(n) {
  const unresolved = new Set();
  // Wikilinks become inline HTML before Markdown parsing (no pipes left behind to break tables).
  const protect = [];
  let md = n.body.replace(/(```[\s\S]*?```|`[^`\n]*`)/g, (m) => { protect.push(m); return `\u0000${protect.length - 1}\u0000`; });
  md = md.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (_, bang, inner) => {
    inner = inner.replace(/\\\|/g, '|');
    const bar = inner.indexOf('|');
    const target = bar < 0 ? inner : inner.slice(0, bar);
    let label = bar < 0 ? null : inner.slice(bar + 1);
    const hash = target.indexOf('#');
    const file = hash < 0 ? target : target.slice(0, hash);
    const heading = hash < 0 ? '' : target.slice(hash + 1).replace(/^\^/, '');
    if (!label) label = heading ? (file ? `${path.posix.basename(file)} › ${heading}` : heading) : path.posix.basename(file).replace(/\.md$/i, '');
    if (attachExt.test(file)) return `<span class="att" title="${esc(path.posix.basename(file))}">${esc(label)}</span>`;
    const hit = resolve(file, n);
    if (!hit) { unresolved.add(file); return `<span class="unres" title="Not in the library yet">${esc(label)}</span>`; }
    if (hit !== n) n.links.add(hit);
    const frag = heading ? '#' + headingId(heading) : '';
    if (bang) return `<a class="wl embed" data-note="${hit.id}" href="/lawlibrary/${hit.id}/${frag}">${esc(label)}</a>`;
    return `<a class="wl" data-note="${hit.id}"${heading ? ` data-h="${headingId(heading)}"` : ''} href="/lawlibrary/${hit.id}/${frag}">${esc(label)}</a>`;
  });
  md = md.replace(/\u0000(\d+)\u0000/g, (_, i) => protect[+i]);
  // Inline #tags (outside headings) become chips.
  md = md.replace(/(^|[\s(])#([A-Za-z][\w/-]*)/g, (m, pre, tag, off, all) => {
    const lineStart = all.lastIndexOf('\n', off) + 1;
    if (/^#{1,6}\s/.test(all.slice(lineStart, lineStart + 7))) return m;
    return `${pre}<span class="tag">#${tag}</span>`;
  });

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    walkTokens(tok) {
      if (tok.type !== 'blockquote' || !tok.tokens || !tok.tokens.length) return;
      const p = tok.tokens[0];
      if (p.type !== 'paragraph') return;
      const m = /^\[!([A-Za-z-]+)\]([-+]?)[ \t]*([^\n]*)\n?/.exec(p.text);
      if (!m) return;
      const type = m[1].toLowerCase();
      tok.callout = { type: CALLOUT_ALIAS[type] || type, title: m[3].trim() || type[0].toUpperCase() + type.slice(1), fold: m[2] };
      const rest = p.text.slice(m[0].length);
      if (rest.trim()) { p.text = rest; p.raw = rest; p.tokens = marked.Lexer.lexInline(rest); }
      else tok.tokens.shift();
    },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        return `<h${depth} id="${headingId(html)}">${html}</h${depth}>\n`;
      },
      blockquote(tok) {
        const inner = this.parser.parse(tok.tokens);
        if (!tok.callout) return `<blockquote>${inner}</blockquote>\n`;
        const { type, title, fold } = tok.callout;
        const t = marked.parseInline(title);
        if (fold) return `<details class="callout c-${type}"${fold === '+' ? ' open' : ''}><summary class="callout-t">${t}</summary><div class="callout-b">${inner}</div></details>\n`;
        return `<div class="callout c-${type}"><div class="callout-t">${t}</div><div class="callout-b">${inner}</div></div>\n`;
      },
      table(tok) {
        // keep wide tables scrollable inside the reader
        const head = tok.header.map((c, i) => `<th${tok.align[i] ? ` style="text-align:${tok.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = tok.rows.map((r) => '<tr>' + r.map((c, i) => `<td${tok.align[i] ? ` style="text-align:${tok.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('') + '</tr>').join('\n');
        return `<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        if (/^(https?:|mailto:)/i.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
        // a Markdown link to another note in the vault
        const [file, frag] = decodeURI(href).split('#');
        if (attachExt.test(file)) return `<span class="att">${text}</span>`;
        const hit = resolve(file, n);
        if (!hit) return `<span class="unres">${text}</span>`;
        if (hit !== n) n.links.add(hit);
        return `<a class="wl" data-note="${hit.id}" href="/lawlibrary/${hit.id}/${frag ? '#' + headingId(frag) : ''}">${text}</a>`;
      },
      image({ href, text }) {
        if (/^https?:/i.test(href)) return `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy">`;
        return `<span class="att">${esc(text || path.posix.basename(href))}</span>`;
      },
      html({ text }) {
        // raw HTML in a note is shown as text, except the inline spans/anchors added above
        return /^<(a|span)\b/.test(text.trim()) || /^<\/(a|span)>/.test(text.trim()) ? text : esc(text);
      },
    },
  });
  let html = marked.parse(md);
  // Drop the note's own top heading: the reader shows the title in its header.
  html = html.replace(/^\s*<h1 id="[^"]*">([\s\S]*?)<\/h1>\n?/, '');
  return { html, unresolved: [...unresolved] };
}

// ---------- groups (orbit rings inside a course) ----------
for (const c of courses) {
  const mine = notes.filter((n) => n.course === c.id);
  c.count = mine.length;
  const hubNote = mine.find((n) => n.folder === '' && n.title.toLowerCase() === c.name.toLowerCase())
    || mine.find((n) => n.folder === '' && [].concat(n.fm.tags || []).some((t) => /hub\/course|^course$/.test(t)));
  c.hub = hubNote ? hubNote.id : null;
  const g = new Map();
  for (const n of mine) {
    if (hubNote && n === hubNote) continue;
    const key = n.folder || 'Notes';
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(n);
  }
  // A folder that only holds its own hub note (e.g. "Formal Notes/Formal Notes.md") joins its biggest child ring.
  for (const [key, list] of [...g]) {
    if (list.length === 1 && path.posix.basename(key) === list[0].title) {
      const kids = [...g.keys()].filter((k) => k.startsWith(key + '/'));
      if (kids.length) { g.delete(key); const host = kids.sort((a, b) => g.get(b).length - g.get(a).length)[0]; g.get(host).unshift(list[0]); }
    }
  }
  c.groups = [...g].map(([key, list]) => {
    list.sort((a, b) => {
      const wa = +(a.fm.week || 0), wb = +(b.fm.week || 0);
      const ha = path.posix.basename(a.folder) === a.title ? -1 : 0, hb = path.posix.basename(b.folder) === b.title ? -1 : 0;
      return ha - hb || wa - wb || a.title.localeCompare(b.title, undefined, { numeric: true });
    });
    return { name: key.split('/').join(' / '), key, notes: list.map((n) => n.id) };
  }).sort((a, b) => a.notes.length - b.notes.length || a.name.localeCompare(b.name));
}

// ---------- render every note, then write ----------
const dataDir = path.join(OUT, 'data');
fs.rmSync(path.join(dataDir, 'notes'), { recursive: true, force: true });
const allUnresolved = new Map();
for (const n of notes) {
  const { html, unresolved } = renderNote(n);
  n.html = html;
  for (const u of unresolved) allUnresolved.set(u, (allUnresolved.get(u) || 0) + 1);
  const words = n.body.replace(/[#>*_`|\-[\]]/g, ' ').split(/\s+/).filter(Boolean).length;
  n.words = words;
  const outFile = path.join(dataDir, 'notes', n.course, `${n.slug}.html`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
}

const META_KEYS = ['citation', 'court', 'year', 'casebook', 'week', 'professor', 'term', 'type', 'coverage'];
const manifest = {
  title: "Walker's Law Library",
  root: ROOT_NAME,
  generated: new Date().toISOString(),
  courses: courses.map(({ id, name, color, hub, groups, count, attachments }) => ({ id, name, color, hub, count, attachments, groups })),
  notes: notes.map((n) => {
    const meta = {};
    for (const k of META_KEYS) if (n.fm[k] !== undefined && n.fm[k] !== '' && !(Array.isArray(n.fm[k]) && !n.fm[k].length)) meta[k] = n.fm[k];
    const topics = [].concat(n.fm.topics || []);
    if (topics.length) meta.topics = topics;
    return {
      id: n.id, course: n.course, slug: n.slug, title: n.title, folder: n.folder,
      aliases: [].concat(n.fm.aliases || []), tags: [].concat(n.fm.tags || []), meta, words: n.words,
      links: [...n.links].map((x) => x.id).sort(),
    };
  }),
};
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'manifest.json'), JSON.stringify(manifest));

// ---------- static entry pages (real URLs work on GitHub Pages without the 404 hop) ----------
const shell = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const keep = new Set(['data', 'index.html', 'app.js', 'app.css']);
for (const e of fs.readdirSync(OUT, { withFileTypes: true })) {
  if (e.isDirectory() && !keep.has(e.name) && courses.some((c) => c.id === e.name)) fs.rmSync(path.join(OUT, e.name), { recursive: true, force: true });
}
const page = (title, desc) => shell
  .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
for (const c of courses) {
  const dir = path.join(OUT, c.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(`${c.name} · Walker's Law Library`, `${c.name}: ${c.count} notes in Walker's Law Library.`));
}
for (const n of notes) {
  const dir = path.join(OUT, n.course, n.slug);
  fs.mkdirSync(dir, { recursive: true });
  const c = courses.find((x) => x.id === n.course);
  const desc = (n.fm.citation ? `${n.fm.citation}. ` : '') + `${c.name} notes in Walker's Law Library.`;
  fs.writeFileSync(path.join(dir, 'index.html'), page(`${n.title} · Walker's Law Library`, desc));
}

const linkCount = notes.reduce((s, n) => s + n.links.size, 0);
console.log(`Law Library built from ${SRC}`);
for (const c of courses) console.log(`  ${c.name.padEnd(24)} ${String(c.count).padStart(4)} notes  ${c.groups.map((g) => `${g.name} (${g.notes.length})`).join(', ') || '(empty orbit)'}`);
console.log(`  ${notes.length} notes, ${linkCount} note-to-note links, ${allUnresolved.size} unresolved targets`);
if (allUnresolved.size) console.log('  unresolved:', [...allUnresolved].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} (${v})`).join('; '));
