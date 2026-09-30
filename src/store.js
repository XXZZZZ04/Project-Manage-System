import { createSeed, SCHEMA } from './seed.js';
import { nowStamp, uid } from './util.js';

const KEY = 'pms-prototype-v1';

const memory = new Map();
const ls = globalThis.localStorage ?? {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, v),
  removeItem: (k) => memory.delete(k),
};

export let state;

let saveSeq = 0;

function serializeTask(t) {
  return {
    id: t.id,
    versionId: t.versionId,
    moduleId: t.moduleId,
    title: t.title,
    description: t.description || '',
    status: t.status,
    blockReason: t.blockReason || '',
    createdAt: t.createdAt || '',
    endedAt: t.endedAt || '',
    updatedAt: t.updatedAt || '',
    autoComplete: !!t.autoComplete,
    autoCompleted: !!t.autoCompleted,
    focus: t.focus || null,
    checks: (t.checks || []).map((c) => ({ id: c.id, text: c.text, done: !!c.done })),
    subtasks: (t.subtasks || []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description || '',
      done: !!s.done,
    })),
    dependsOn: [...(t.dependsOn || [])],
    fromIdeaId: t.fromIdeaId || null,
  };
}

export function projectFiles(source = state) {
  const files = {};
  for (const p of source.projects) {
    const root = `projects/${p.id}`;
    files[`${root}/project.json`] = JSON.stringify({
      name: p.name,
      description: p.description,
      tags: p.tags,
      modules: p.modules,
      versions: p.versions,
    }, null, 2);
    files[`${root}/tasks.json`] = JSON.stringify(p.tasks.map(serializeTask), null, 2);
    files[`${root}/bugs.json`] = JSON.stringify(p.bugs, null, 2);
    files[`${root}/ideas.json`] = JSON.stringify(p.ideas, null, 2);
    files[`${root}/notes.json`] = JSON.stringify(p.notes, null, 2);
    files[`${root}/milestones.json`] = JSON.stringify(p.milestones, null, 2);
  }
  files['trash.json'] = JSON.stringify(source.trash, null, 2);
  return files;
}

export function syncFiles(source = state) {
  const files = projectFiles(source);
  files['library.json'] = JSON.stringify({
    schema: source.schema,
    projectOrder: source.projects.map((project) => project.id),
    tagKinds: source.tagKinds,
  }, null, 2);
  return files;
}

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function hydrateFiles(files) {
  const library = parseJson(files['library.json'], { schema: SCHEMA, projectOrder: [], tagKinds: [] });
  const trash = parseJson(files['trash.json'], []);
  const ids = [];
  for (const filePath of Object.keys(files)) {
    const match = /^projects\/([^/]+)\/project\.json$/.exec(filePath);
    if (match) ids.push(match[1]);
  }
  const order = Array.isArray(library.projectOrder) ? library.projectOrder : [];
  ids.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const projects = ids.map((id) => {
    const root = `projects/${id}`;
    const meta = parseJson(files[`${root}/project.json`], {});
    return {
      id,
      name: meta.name || '未命名项目',
      description: meta.description || '',
      tags: meta.tags || {},
      modules: meta.modules || [],
      versions: meta.versions || [],
      tasks: parseJson(files[`${root}/tasks.json`], []),
      bugs: parseJson(files[`${root}/bugs.json`], []),
      ideas: parseJson(files[`${root}/ideas.json`], []),
      notes: parseJson(files[`${root}/notes.json`], []),
      milestones: parseJson(files[`${root}/milestones.json`], []),
    };
  });
  return {
    schema: library.schema || SCHEMA,
    tagKinds: library.tagKinds || [],
    projects,
    trash,
  };
}

function emptyGithub() {
  return { url: '', branch: 'main', username: '', token: '', remembered: true };
}

function emptyGit() {
  return {
    branch: 'main',
    ahead: 0,
    behind: 0,
    commitMessage: '',
    staged: {},
    base: {},
    incoming: [],
    commits: [],
    live: true,
    changes: [],
  };
}

export function desktopSeed() {
  const next = createSeed();
  next.projects = [];
  next.trash = [];
  next.settings.github = emptyGithub();
  next.git = emptyGit();
  next.ui.projectId = '';
  next.ui.expanded = {};
  next.ui.listVersion = '';
  next.ui.kanbanVersion = '';
  next.ui.graphTaskId = '';
  for (const kind of next.tagKinds) {
    if (kind.bindVersions) kind.values = kind.values.filter((value) => !value.projectId);
  }
  return next;
}

export function normalizeUi(target) {
  target.ui = target.ui || {};
  const ui = target.ui;
  ui.bugDrafts = ui.bugDrafts || {};
  ui.expanded = ui.expanded || {};
  ui.expandedProjects = ui.expandedProjects || {};
  ui.subDesc = ui.subDesc || {};
  ui.taskMeta = ui.taskMeta || {};
  ui.depOpen = ui.depOpen || {};
  const tabIds = ['dashboard', 'list', 'kanban', 'bugs', 'ideas'];
  const order = Array.isArray(ui.tabOrder) ? ui.tabOrder.filter((id) => tabIds.includes(id)) : [];
  for (const id of tabIds) if (!order.includes(id)) order.push(id);
  ui.tabOrder = order;
  const project = (target.projects || []).find((item) => item.id === ui.projectId) || target.projects?.[0];
  if (project && !ui.projectId) ui.projectId = project.id;
  const latest = project?.versions?.[project.versions.length - 1];
  const versions = project?.versions || [];
  if (latest && (!ui.listVersion || ui.listVersion === 'all' || !versions.some((version) => version.id === ui.listVersion))) {
    ui.listVersion = latest.id;
  }
  if (latest && (!ui.kanbanVersion || ui.kanbanVersion === 'all' || !versions.some((version) => version.id === ui.kanbanVersion))) {
    ui.kanbanVersion = latest.id;
  }
  const sideWidth = Number(ui.sidebarWidth);
  ui.sidebarWidth = Number.isFinite(sideWidth) ? Math.min(480, Math.max(200, sideWidth)) : 268;
  target.git = target.git || emptyGit();
  target.git.staged = target.git.staged || {};
  target.git.incoming = target.git.incoming || [];
  target.git.base = target.git.base || {};
  target.git.changes = target.git.changes || [];
  target.git.commits = target.git.commits || [];
  target.trash = target.trash || [];
  target.settings = target.settings || { theme: 'dark', github: emptyGithub() };
  target.settings.github = Object.assign(emptyGithub(), target.settings.github || {});
}

export function applyGitStatus(info) {
  if (!info) return;
  state.git.live = true;
  state.git.branch = info.branch || state.git.branch || 'main';
  state.git.ahead = info.ahead || 0;
  state.git.behind = info.behind || 0;
  state.git.commits = info.commits || [];
  const local = (info.local || []).map((entry) => {
    const kind = kindFromStatus(entry.x, entry.y);
    return {
      path: entry.path,
      kind,
      staged: entry.x !== ' ' && entry.x !== '?' && (entry.y === ' ' || !entry.y),
      remote: false,
      summary: describeLocal(entry.path, kind),
    };
  });
  const remote = (info.remote || []).map((entry) => ({
    path: entry.path,
    kind: 'P',
    staged: false,
    remote: true,
    summary: '远端有更新，拉取后会写进这台电脑',
  }));
  state.git.changes = [...local, ...remote];
}

function kindFromStatus(x, y) {
  const code = y && y !== ' ' && y !== '?' ? y : x;
  if (code === '?' || code === 'A' || code === 'C') return 'A';
  if (code === 'D') return 'D';
  return 'M';
}

function bootDesktop(loaded) {
  if (loaded.empty) {
    state = desktopSeed();
  } else {
    const data = hydrateFiles(loaded.files || {});
    const session = loaded.session || {};
    state = {
      schema: data.schema || SCHEMA,
      settings: session.settings || { theme: 'dark', github: emptyGithub() },
      tagKinds: data.tagKinds,
      projects: data.projects,
      trash: data.trash,
      git: emptyGit(),
      ui: session.ui || {},
      toast: null,
      modal: null,
    };
    state.git.commitMessage = session.commitMessage || '';
  }
  state.desktop = true;
  state.git.live = true;
  state.vaultPath = loaded.vaultPath || '';
  normalizeUi(state);
  if (loaded.status) applyGitStatus(loaded.status);
  if (loaded.empty) persist({ status: true, sync: true });
}

function applyDirtySeed(next) {
  const dash = next.projects[0].tasks.find((t) => t.id === 't_dash_cd');
  dash.description += '\n\n本地补充：冷却数字先用一位小数，按键图标等图标定了再补。';
  dash.updatedAt = '2026-09-28T15:12';
  const idea = next.projects[0].ideas.find((i) => i.id === 'i_dur');
  idea.body += '\n还没想好磨刀是在营地，还是战斗里找一块石头。';
  idea.updatedAt = '2026-09-28T15:16';
}

export function freshState() {
  const next = createSeed();
  next.git.base = projectFiles(next);
  applyDirtySeed(next);
  return next;
}

export function persist(options = {}) {
  const copy = JSON.parse(JSON.stringify(state));
  copy.toast = null;
  copy.modal = null;
  if (copy.ui) {
    copy.ui.pendingScroll = '';
    copy.ui.pendingFocus = '';
    copy.ui.layerEnter = false;
    copy.ui.dashAdd = false;
    copy.ui.sortOpen = false;
    copy.ui.versionMenu = false;
    copy.ui.motion = null;
  }
  if (state.desktop && globalThis.pms?.isDesktop) {
    const seq = ++saveSeq;
    const payload = {
      files: syncFiles(copy),
      session: {
        settings: copy.settings,
        ui: copy.ui,
        commitMessage: copy.git?.commitMessage || '',
      },
      status: !!options.status,
    };
    const applySave = (result) => {
      if (result?.status) {
        applyGitStatus(result.status);
        window.dispatchEvent(new Event('pms-refresh'));
      }
      if (seq !== saveSeq) return;
      if (result && result.ok === false) {
        state.toast = state.toast || { msg: result.msg || '没有保存到磁盘', kind: 'error' };
      }
    };
    if (options.sync || !globalThis.pms.save) applySave(globalThis.pms.saveSync(payload));
    else globalThis.pms.save(payload).then(applySave, (error) => applySave({ ok: false, msg: error?.message || '没有保存到磁盘' }));
    return;
  }
  ls.setItem(KEY, JSON.stringify(copy));
}

export function init() {
  if (globalThis.pms?.isDesktop) {
    const loaded = globalThis.pms.load();
    if (!loaded?.ok) {
      state = desktopSeed();
      state.desktop = true;
      state.git.live = true;
      state.vaultPath = loaded?.vaultPath || '';
      normalizeUi(state);
      state.toast = { msg: loaded?.msg || '数据目录还没准备好', kind: 'error' };
      return;
    }
    bootDesktop(loaded);
    return;
  }
  const raw = ls.getItem(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.schema === SCHEMA && Array.isArray(parsed.projects)) {
        state = parsed;
        state.toast = null;
        state.modal = null;
        state.ui = state.ui || {};
        state.ui.pendingScroll = '';
        state.ui.quickOpen = false;
        state.ui.bugDrafts = state.ui.bugDrafts || {};
        state.ui.expanded = state.ui.expanded || {};
        state.ui.expandedProjects = state.ui.expandedProjects || {};
        state.ui.subDesc = state.ui.subDesc || {};
        state.ui.taskMeta = state.ui.taskMeta || {};
        state.ui.depOpen = state.ui.depOpen || {};
        state.ui.sortOpen = false;
        state.ui.versionMenu = false;
        state.ui.dashAdd = false;
        const tabIds = ['dashboard', 'list', 'kanban', 'bugs', 'ideas'];
        const order = Array.isArray(state.ui.tabOrder) ? state.ui.tabOrder.filter((id) => tabIds.includes(id)) : [];
        for (const id of tabIds) if (!order.includes(id)) order.push(id);
        state.ui.tabOrder = order;
        const project = (state.projects || []).find((p) => p.id === state.ui.projectId) || state.projects?.[0];
        const latest = project?.versions?.[project.versions.length - 1];
        if (latest && (!state.ui.listVersion || state.ui.listVersion === 'all')) state.ui.listVersion = latest.id;
        if (latest && (!state.ui.kanbanVersion || state.ui.kanbanVersion === 'all')) state.ui.kanbanVersion = latest.id;
        const sideWidth = Number(state.ui.sidebarWidth);
        state.ui.sidebarWidth = Number.isFinite(sideWidth) ? Math.min(480, Math.max(200, sideWidth)) : 268;
        state.git = state.git || {};
        state.git.staged = state.git.staged || {};
        state.git.incoming = state.git.incoming || [];
        state.git.base = state.git.base || {};
        state.trash = state.trash || [];
        return;
      }
    } catch {
      /* reseed */
    }
  }
  state = freshState();
  persist();
}

export function reset() {
  if (state?.desktop && globalThis.pms?.isDesktop) {
    const vaultPath = state.vaultPath;
    state = desktopSeed();
    state.desktop = true;
    state.vaultPath = vaultPath;
    normalizeUi(state);
    persist({ status: true, sync: true });
    return;
  }
  ls.removeItem(KEY);
  state = freshState();
  persist();
}

export function hasGithubFields() {
  const g = state.settings?.github;
  if (!g?.username || !g.token || !g.url) return false;
  try {
    const host = new URL(g.url).hostname;
    return host === 'github.com' || host.endsWith('.github.com');
  } catch {
    return false;
  }
}

export function isLoggedIn() {
  if (!hasGithubFields()) return false;
  if (state?.desktop) return !!state.settings.github.verified;
  return true;
}

export function gitChanges() {
  if (state?.git?.live) return state.git.changes || [];
  const current = projectFiles(state);
  const base = state.git.base || {};
  const staged = state.git.staged || {};
  const paths = new Set([...Object.keys(current), ...Object.keys(base)]);
  const changes = [];
  for (const path of [...paths].sort()) {
    const inC = Object.prototype.hasOwnProperty.call(current, path);
    const inB = Object.prototype.hasOwnProperty.call(base, path);
    let kind = '';
    if (inC && !inB) kind = 'A';
    else if (!inC && inB) kind = 'D';
    else if (current[path] !== base[path]) kind = 'M';
    if (!kind) continue;
    changes.push({ path, kind, staged: !!staged[path], remote: false, summary: describeLocal(path, kind) });
  }
  for (const inc of state.git.incoming || []) {
    changes.push({
      path: inc.path,
      kind: 'P',
      staged: false,
      remote: true,
      summary: inc.summary,
    });
  }
  return changes;
}

function describeLocal(path, kind) {
  if (kind === 'A') return '新文件，还没提交';
  if (kind === 'D') return '已删除。提交后，这次删除会同步到仓库';
  if (path.endsWith('/tasks.json')) return '任务有改动';
  if (path.endsWith('/ideas.json')) return '想法有改动';
  if (path.endsWith('/bugs.json')) return 'Bug 有改动';
  if (path.endsWith('/notes.json')) return '笔记有改动';
  if (path.endsWith('/milestones.json')) return '里程碑有改动';
  if (path.endsWith('/project.json')) return '项目信息、模块或版本有改动';
  if (path === 'trash.json') return '回收站有改动';
  if (path === 'library.json') return '标签种类有改动';
  return '已修改';
}

export function fileLabel(path) {
  const match = /^projects\/([^/]+)\/(.+)$/.exec(path);
  if (!match) return { dir: '', name: path };
  const project = state.projects.find((p) => p.id === match[1]);
  const trashed = state.trash.find((t) => t.kind === 'project' && t.payload?.id === match[1]);
  return { dir: project?.name || trashed?.name || match[1], name: match[2] };
}

export function currentProject() {
  return state.projects.find((p) => p.id === state.ui.projectId) || null;
}

export function findProject(id) {
  return state.projects.find((p) => p.id === id) || null;
}

export function statusLabel(list, id) {
  return list.find((s) => s.id === id)?.label || id;
}

export function kinds(domain) {
  return state.tagKinds.filter((k) => k.domain === domain);
}

export function tagValue(kindId, valueId) {
  const kind = state.tagKinds.find((k) => k.id === kindId);
  return kind?.values.find((v) => v.id === valueId) || null;
}

export function sidebarChips(project) {
  return kinds('project')
    .filter((k) => k.slot >= 1 && k.slot <= 3)
    .sort((a, b) => a.slot - b.slot)
    .map((kind) => {
      const value = tagValue(kind.id, project.tags?.[kind.id]);
      if (!value || !value.name) return null;
      return { name: value.name, color: kind.color, kind: kind.name };
    })
    .filter(Boolean);
}

export function latestVersion(project) {
  return project.versions[project.versions.length - 1] || null;
}

export function syncVersionTag(project) {
  const kind = state.tagKinds.find((k) => k.domain === 'project' && k.bindVersions);
  const version = latestVersion(project);
  if (!kind || !version) return;
  let value = kind.values.find((v) => v.projectId === project.id && v.name === version.name);
  if (!value) {
    value = { id: uid('vv'), name: version.name, projectId: project.id };
    kind.values.push(value);
  }
  project.tags = project.tags || {};
  project.tags[kind.id] = value.id;
}

export function childrenComplete(task) {
  const has = (task.subtasks?.length || 0) + (task.checks?.length || 0) > 0;
  if (!has) return false;
  return task.subtasks.every((s) => s.done) && task.checks.every((c) => c.done);
}

export function syncAuto(task) {
  const has = (task.subtasks?.length || 0) + (task.checks?.length || 0) > 0;
  if (!has || !task.autoComplete || task.status === 'abandoned') return null;
  const ok = childrenComplete(task);
  if (ok && task.status !== 'done') {
    task.status = 'done';
    task.autoCompleted = true;
    if (!task.endedAt) task.endedAt = nowStamp();
    task.updatedAt = nowStamp();
    return 'done';
  }
  if (!ok && task.autoCompleted && task.status === 'done') {
    task.status = 'doing';
    task.autoCompleted = false;
    task.endedAt = '';
    task.updatedAt = nowStamp();
    return 'reopen';
  }
  return null;
}

export function setTaskStatus(task, status) {
  const prev = task.status;
  task.status = status;
  task.updatedAt = nowStamp();
  task.autoCompleted = false;
  if (status === 'done' && !task.endedAt) task.endedAt = nowStamp();
  if (status !== 'done' && prev === 'done' && childrenComplete(task)) {
    task.autoComplete = false;
  }
  if (status === 'blocked' && task.blockReason == null) task.blockReason = '';
}

export function wouldCycle(tasks, taskId, depId) {
  const seen = new Set();
  function walk(id) {
    if (id === taskId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const t = tasks.find((item) => item.id === id);
    if (!t) return false;
    return (t.dependsOn || []).some(walk);
  }
  return walk(depId);
}

export function taskProgress(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function counts(tasks) {
  const count = (status) => tasks.filter((t) => t.status === status).length;
  return {
    total: tasks.length,
    done: count('done'),
    todo: count('todo'),
    doing: count('doing'),
    blocked: count('blocked'),
    abandoned: count('abandoned'),
    verify: count('verify'),
  };
}

export function sortTasks(list) {
  const order = state.ui.statusOrder;
  const dir = state.ui.sortDir === 'desc' ? -1 : 1;
  const mode = state.ui.sortMode;
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (mode === 'status') cmp = order.indexOf(a.status) - order.indexOf(b.status);
    else if (mode === 'created') cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
    else if (mode === 'ended') cmp = (a.endedAt || '9999').localeCompare(b.endedAt || '9999');
    else cmp = (a.title || '').localeCompare(b.title || '', 'zh');
    if (cmp === 0) cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
    return cmp * dir;
  });
}

export function searchAll(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  const hit = (...parts) => parts.some((part) => String(part || '').toLowerCase().includes(q));
  for (const project of state.projects) {
    if (hit(project.name, project.description)) {
      out.push({ type: '项目', typeId: 'project', title: project.name, hint: project.description, projectId: project.id });
    }
    for (const item of project.tasks) {
      const sub = (item.subtasks || []).map((s) => `${s.title} ${s.description}`).join(' ');
      if (hit(item.title, item.description, sub)) {
        out.push({ type: '任务', typeId: 'task', title: item.title, hint: project.name, projectId: project.id, taskId: item.id });
      }
    }
    for (const item of project.bugs) {
      if (hit(item.name, item.summary)) {
        out.push({ type: 'Bug', typeId: 'bug', title: item.name, hint: project.name, projectId: project.id, bugId: item.id });
      }
    }
    for (const item of project.ideas) {
      if (hit(item.title, item.body)) {
        out.push({ type: '想法', typeId: 'idea', title: item.title, hint: project.name, projectId: project.id, ideaId: item.id });
      }
    }
    for (const item of project.notes) {
      if (hit(item.title, item.body)) {
        out.push({ type: '笔记', typeId: 'note', title: item.title, hint: project.name, projectId: project.id, noteId: item.id });
      }
    }
  }
  return out.slice(0, 40);
}

export function softDelete(entry) {
  state.trash.unshift({
    id: uid('trash'),
    deletedAt: nowStamp(),
    ...entry,
  });
}

export function commitStaged(message) {
  const text = message.trim();
  if (!text) return { ok: false, msg: '先写提交信息' };
  const changes = gitChanges().filter((c) => c.staged && !c.remote);
  if (!changes.length) return { ok: false, msg: '没有暂存的更改' };
  const current = projectFiles(state);
  for (const change of changes) {
    if (change.kind === 'D') delete state.git.base[change.path];
    else state.git.base[change.path] = current[change.path];
    delete state.git.staged[change.path];
  }
  state.git.commits.unshift({
    id: uid('c'),
    message: text,
    at: nowStamp(),
    pushed: false,
    files: changes.map((c) => c.path),
  });
  state.git.commits = state.git.commits.slice(0, 20);
  state.git.ahead = state.git.commits.filter((c) => !c.pushed).length;
  state.git.commitMessage = '';
  return { ok: true, msg: `已提交 ${changes.length} 个文件` };
}

export function pushCommits() {
  if (!isLoggedIn()) return { ok: false, msg: '请先在设置里登录 GitHub 仓库' };
  const pending = state.git.commits.filter((c) => !c.pushed);
  if (!pending.length) return { ok: false, msg: '没有需要推送的提交' };
  pending.forEach((c) => { c.pushed = true; });
  state.git.ahead = 0;
  const repo = state.settings.github;
  return { ok: true, msg: `已推送到 ${repo.url} 的 ${repo.branch}` };
}

export function pullCommits() {
  if (!isLoggedIn()) return { ok: false, msg: '请先在设置里登录 GitHub 仓库' };
  const incoming = state.git.incoming || [];
  if (!incoming.length && !state.git.behind) return { ok: true, msg: '已经是最新' };
  let applied = 0;
  for (const inc of incoming) {
    const project = findProject(inc.projectId);
    if (project && inc.milestone && !project.milestones.some((m) => m.id === inc.milestone.id)) {
      project.milestones.push({ ...inc.milestone });
      applied += 1;
    }
  }
  state.git.incoming = [];
  state.git.behind = 0;
  const current = projectFiles(state);
  for (const inc of incoming) {
    if (current[inc.path] != null) state.git.base[inc.path] = current[inc.path];
  }
  return { ok: true, msg: applied ? `已拉取 ${applied} 项远端更改` : '已拉取，没有新内容' };
}

export { uid, nowStamp };
