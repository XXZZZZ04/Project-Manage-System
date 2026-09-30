import { BUG_STATUSES } from './seed.js';
import {
  applyGitStatus,
  commitStaged,
  currentProject,
  findProject,
  gitChanges,
  hasGithubFields,
  hydrateFiles,
  isLoggedIn,
  kinds,
  latestVersion,
  normalizeUi,
  nowStamp,
  persist,
  pullCommits,
  pushCommits,
  reset,
  searchAll,
  setTaskStatus,
  softDelete,
  state,
  syncAuto,
  syncVersionTag,
  uid,
  wouldCycle,
} from './store.js';

let paint = () => {};
let toastTimer = 0;

export function bind(renderFn) {
  paint = renderFn;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('drop', onDrop);
  document.addEventListener('dragend', clearDrop);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('pointerleave', resetPointerMotion);
  document.addEventListener('scroll', onSettingsScroll, true);
  document.addEventListener('toggle', onDepToggle, true);
  window.addEventListener('beforeunload', () => {
    clearTimeout(persistTimer);
    persist({ sync: true });
  });
  window.addEventListener('pms-refresh', () => paint());
  if (globalThis.pms?.checkUpdate) setTimeout(() => checkForUpdate(false), 1200);
}

function onPointerMove(event) {
  if (resizeSidebar(event)) return;
  if (movePressedTab(event)) return;
  tiltSheet(event);
  nudgeControl(event);
}

function nudgeControl(event) {
  const btn = event.target instanceof Element ? event.target.closest('.act-btn, .icon-btn, .sb-git, .tab') : null;
  document.querySelectorAll('.is-nudge').forEach((node) => {
    if (node !== btn) clearNudge(node);
  });
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const px = (event.clientX - rect.left) / rect.width - 0.5;
  const py = (event.clientY - rect.top) / rect.height - 0.5;
  btn.classList.add('is-nudge');
  btn.style.setProperty('--nx', `${(px * 5).toFixed(2)}px`);
  btn.style.setProperty('--ny', `${(py * 4).toFixed(2)}px`);
}

function clearNudge(node) {
  node.classList.remove('is-nudge');
  node.style.setProperty('--nx', '0px');
  node.style.setProperty('--ny', '0px');
}

function resetPointerMotion() {
  resetSheetTilt();
  document.querySelectorAll('.is-nudge').forEach(clearNudge);
}

function tiltSheet(event) {
  const sheet = event.target instanceof Element ? event.target.closest('.sheet') : null;
  document.querySelectorAll('.sheet.is-tilt').forEach((node) => {
    if (node !== sheet) resetOneSheet(node);
  });
  if (!sheet) return;
  const rect = sheet.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const px = (event.clientX - rect.left) / rect.width - 0.5;
  const py = (event.clientY - rect.top) / rect.height - 0.5;
  sheet.classList.add('is-tilt');
  sheet.style.setProperty('--tilt-x', `${(-py * 14).toFixed(2)}deg`);
  sheet.style.setProperty('--tilt-y', `${(px * 16).toFixed(2)}deg`);
}

function resetSheetTilt() {
  document.querySelectorAll('.sheet.is-tilt').forEach(resetOneSheet);
}

function resetOneSheet(node) {
  node.classList.remove('is-tilt');
  node.style.setProperty('--tilt-x', '0deg');
  node.style.setProperty('--tilt-y', '0deg');
}

let persistTimer = 0;
let persistWantsStatus = false;

function schedulePersist(options = {}) {
  if (options.status) persistWantsStatus = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const status = persistWantsStatus;
    persistWantsStatus = false;
    persist({ status });
  }, options.delay ?? 40);
}

function draw(options = {}) {
  paint(options);
  schedulePersist(options);
}

function toast(msg, kind = 'info') {
  state.toast = { msg, kind };
  paint();
  schedulePersist();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = null;
    const node = document.querySelector('.toast');
    if (node) node.remove();
  }, 2800);
}

function needProject() {
  const project = currentProject();
  if (project) return project;
  toast('先在左侧选择或新建一个项目', 'error');
  return null;
}

function blankTask(partial) {
  return {
    id: uid('t'),
    title: '未命名任务',
    description: '',
    status: 'todo',
    blockReason: '',
    createdAt: nowStamp(),
    endedAt: '',
    updatedAt: nowStamp(),
    autoComplete: true,
    autoCompleted: false,
    focus: null,
    checks: [],
    subtasks: [],
    dependsOn: [],
    fromIdeaId: null,
    ...partial,
  };
}

function onClick(event) {
  if (Date.now() < suppressClickUntil) return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const menusChanged = closeMenus(target);
  const el = target?.closest?.('[data-act]');
  if (!el || el.dataset.act === 'stop') {
    if (menusChanged) draw();
    return;
  }
  run(el.dataset.act, el);
}

function closeMenus(target) {
  if (!target) return false;
  const anchor = target.closest('.menu-anchor, .dash-add');
  const keep = anchor?.querySelector('[data-act]')?.dataset.act || '';
  let changed = false;
  if (state.ui.quickOpen && keep !== 'toggle-quick') {
    state.ui.quickOpen = false;
    changed = true;
  }
  if (state.ui.dashAdd && keep !== 'toggle-dash-add') {
    state.ui.dashAdd = false;
    changed = true;
  }
  if (state.ui.versionMenu && keep !== 'toggle-versions') {
    state.ui.versionMenu = false;
    changed = true;
  }
  if (state.ui.sortOpen && keep !== 'toggle-sort') {
    state.ui.sortOpen = false;
    changed = true;
  }
  return changed;
}

function run(act, el) {
  const id = el.dataset.id || '';
  const project = currentProject();
  switch (act) {
    case 'stop':
      return;
    case 'toggle-sidebar':
      state.ui.sidebarOpen = !state.ui.sidebarOpen;
      draw();
      return;
    case 'close-sidebar':
      state.ui.sidebarOpen = false;
      draw();
      return;
    case 'activity':
      openActivity(id);
      break;
    case 'toggle-quick':
      state.ui.quickOpen = !state.ui.quickOpen;
      break;
    case 'toggle-dash-add':
      state.ui.dashAdd = !state.ui.dashAdd;
      break;
    case 'toggle-versions':
      state.ui.versionMenu = !state.ui.versionMenu;
      state.ui.sortOpen = false;
      break;
    case 'toggle-sort':
      state.ui.sortOpen = !state.ui.sortOpen;
      state.ui.versionMenu = false;
      break;
    case 'toggle-project':
      state.ui.expandedProjects = state.ui.expandedProjects || {};
      state.ui.expandedProjects[id] = !state.ui.expandedProjects[id];
      break;
    case 'toggle-desc':
    case 'toggle-sub-desc':
      state.ui.subDesc = state.ui.subDesc || {};
      state.ui.subDesc[id] = !state.ui.subDesc[id];
      state.ui.motion = { kind: 'desc', id };
      break;
    case 'toggle-task-meta':
      state.ui.taskMeta = state.ui.taskMeta || {};
      state.ui.taskMeta[id] = !state.ui.taskMeta[id];
      break;
    case 'project-settings':
      state.ui.projectSettings = !state.ui.projectSettings;
      state.ui.activity = 'projects';
      if (!state.ui.tab || state.ui.tab === 'settings') state.ui.tab = state.ui.returnTab || 'dashboard';
      break;
    case 'quick-new':
      state.ui.quickOpen = false;
      state.ui.dashAdd = false;
      openQuick(el.dataset.kind);
      break;
    case 'select-project':
      selectProject(id);
      break;
    case 'delete-project':
      askDeleteProject(id);
      break;
    case 'tab':
      openTab(id);
      break;
    case 'kpi':
      state.ui.statusFilter = el.dataset.id || el.dataset.status || id;
      openTab('list');
      break;
    case 'open-task':
      openTask(id);
      break;
    case 'open-idea':
      openIdea(id);
      break;
    case 'clear-focus':
      updateTask(id, (task) => { task.focus = null; });
      break;
    case 'settings-jump':
      jumpSettings(id);
      break;
    case 'version-filter':
      if (el.dataset.scope === 'kanban') state.ui.kanbanVersion = id;
      else state.ui.listVersion = id;
      state.ui.versionMenu = false;
      break;
    case 'sort-dir':
      state.ui.sortDir = state.ui.sortDir === 'asc' ? 'desc' : 'asc';
      break;
    case 'status-move':
      moveStatus(id, Number(el.dataset.dir));
      break;
    case 'clear-filter':
      state.ui.statusFilter = 'all';
      break;
    case 'expand':
      state.ui.expanded[id] = !state.ui.expanded[id];
      state.ui.motion = { kind: 'fold', id };
      break;
    case 'add-task':
      openTaskDraft(el.dataset.version, el.dataset.module);
      break;
    case 'delete-task':
      deleteTask(id);
      break;
    case 'add-sub':
      addSub(id);
      break;
    case 'add-check':
      addCheck(id);
      break;
    case 'delete-sub':
      deleteSub(el.dataset.task, id);
      break;
    case 'delete-check':
      deleteCheck(el.dataset.task, id);
      break;
    case 'kanban-mode':
      state.ui.kanbanMode = id;
      break;
    case 'graph-select':
      state.ui.graphTaskId = id;
      break;
    case 'add-bug':
      addBug(el.dataset.module);
      break;
    case 'delete-bug':
      deleteBug(id);
      break;
    case 'idea-layout':
      if (state.ui.ideaLayout !== id) state.ui.ideaMotion = 'switch';
      state.ui.ideaLayout = id;
      break;
    case 'idea-status':
      state.ui.ideaStatus = id;
      break;
    case 'idea-dir':
      state.ui.ideaDir = state.ui.ideaDir === 'asc' ? 'desc' : 'asc';
      break;
    case 'new-idea':
      openIdea(null);
      break;
    case 'theme':
      state.settings.theme = id;
      break;
    case 'save-github':
      saveGithub();
      return;
    case 'logout':
      logout();
      return;
    case 'kind-count':
      changeKindCount(el.dataset.domain, Number(el.dataset.dir));
      break;
    case 'delete-kind':
      deleteKind(id);
      break;
    case 'add-value':
      addValue(id);
      break;
    case 'delete-value':
      deleteValue(el.dataset.kind, id);
      break;
    case 'add-module':
      addModule();
      break;
    case 'delete-module':
      deleteModule(id);
      break;
    case 'add-version':
      addVersion();
      break;
    case 'delete-version':
      deleteVersion(id);
      break;
    case 'add-milestone':
      addMilestone();
      break;
    case 'delete-milestone':
      deleteMilestone(id);
      break;
    case 'new-note':
      openNote(null);
      break;
    case 'edit-note':
      openNote(id);
      break;
    case 'reset-ask':
      state.modal = {
        type: 'confirm',
        title: '重置示例数据',
        body: state.desktop
          ? '项目、回收站和未提交的更改都会回到最初的示例。已经提交到 Git 的记录还在。'
          : '这台浏览器里的项目、回收站和未提交的更改都会回到最初的示例。',
        confirm: '重置',
        action: 'reset',
      };
      break;
    case 'close-layer':
    case 'back-projects':
      state.ui.activity = 'projects';
      if (!state.ui.tab || state.ui.tab === 'settings') {
        state.ui.tab = state.ui.returnTab && state.ui.returnTab !== 'settings' ? state.ui.returnTab : 'dashboard';
      }
      break;
    case 'restore':
      restoreItem(id);
      break;
    case 'purge':
      askPurge(id);
      break;
    case 'scm-toggle':
      state.ui.scmOpen = !state.ui.scmOpen;
      draw({ status: state.ui.scmOpen });
      return;
    case 'scm-open':
      state.ui.scmOpen = true;
      draw({ status: true });
      return;
    case 'check-update':
      checkForUpdate(true);
      return;
    case 'apply-update':
      applyDesktopUpdate();
      return;
    case 'scm-tool':
      scmTool(id);
      return;
    case 'stage-file':
      if (runLiveGit({ op: 'stage', path: el.dataset.path })) return;
      state.git.staged[el.dataset.path] = true;
      break;
    case 'unstage-file':
      if (runLiveGit({ op: 'unstage', path: el.dataset.path })) return;
      delete state.git.staged[el.dataset.path];
      break;
    case 'pick-file':
      state.ui.scmSelected = state.ui.scmSelected === el.dataset.path ? '' : el.dataset.path;
      break;
    case 'close-modal':
      state.modal = null;
      break;
    case 'confirm-ok':
      confirm();
      return;
    case 'create-project':
      createProject();
      return;
    case 'save-idea':
      saveIdea();
      return;
    case 'delete-idea':
      deleteCurrentIdea();
      return;
    case 'open-convert':
      openConvert();
      return;
    case 'do-convert':
      doConvert();
      return;
    case 'create-task':
      createTask();
      return;
    case 'create-bug':
      createBug();
      return;
    case 'save-note':
      saveNote();
      return;
    case 'delete-note':
      deleteCurrentNote();
      return;
    case 'search-hit':
      openHit(Number(id || el.dataset.i));
      return;
    default:
      return;
  }
  draw();
}

function rememberView() {
  if (state.ui.activity === 'projects' && state.ui.tab && state.ui.tab !== 'settings') {
    state.ui.returnTab = state.ui.tab;
  }
}

function overlayOpen() {
  return state.ui.activity === 'settings' || state.ui.activity === 'tags' || state.ui.activity === 'trash';
}

function openActivity(id) {
  if (state.ui.activity === id) {
    state.ui.activity = 'projects';
    if (!state.ui.tab || state.ui.tab === 'settings') state.ui.tab = state.ui.returnTab || 'dashboard';
    return;
  }
  const entering = !overlayOpen();
  rememberView();
  state.ui.activity = id;
  if (entering) state.ui.layerEnter = true;
  if (id === 'trash') return;
  state.ui.settingsAnchor = id === 'tags' ? 'tags' : 'appearance';
  state.ui.pendingScroll = id === 'tags' ? 'sec-tags' : 'sec-appearance';
}

function openTab(id) {
  if (id === 'settings') {
    const entering = !overlayOpen();
    state.ui.activity = 'settings';
    state.ui.settingsAnchor = state.ui.settingsAnchor || 'appearance';
    if (entering) state.ui.layerEnter = true;
    return;
  }
  state.ui.tab = id;
  state.ui.activity = 'projects';
  state.ui.projectSettings = false;
}

function selectProject(id) {
  state.ui.projectId = id;
  state.ui.activity = 'projects';
  state.ui.projectSettings = false;
  state.ui.tab = 'dashboard';
  state.ui.statusFilter = 'all';
  if (window.innerWidth < 860) state.ui.sidebarOpen = false;
  const project = findProject(id);
  if (!project) return;
  const ids = project.versions.map((v) => v.id);
  if (!ids.includes(state.ui.listVersion)) state.ui.listVersion = ids[ids.length - 1] || '';
  if (!ids.includes(state.ui.kanbanVersion)) state.ui.kanbanVersion = ids[ids.length - 1] || '';
}

function askDeleteProject(id) {
  const project = findProject(id);
  if (!project) return;
  state.modal = {
    type: 'confirm',
    title: '删除项目',
    body: `「${project.name}」会进回收站，里面的任务和想法会一起被收起来，可以再恢复。`,
    confirm: '删除',
    action: 'delete-project',
    id,
  };
}

function jumpSettings(id) {
  const projectSections = {
    project: 'sec-project',
    modules: 'sec-modules',
    versions: 'sec-versions',
    milestones: 'sec-milestones',
    notes: 'sec-notes',
  };
  if (projectSections[id]) {
    state.ui.activity = 'projects';
    state.ui.projectSettings = true;
    if (!state.ui.tab || state.ui.tab === 'settings') state.ui.tab = state.ui.returnTab || 'dashboard';
    state.ui.pendingScroll = projectSections[id];
    return;
  }
  const entering = !overlayOpen();
  rememberView();
  state.ui.activity = id === 'tags' ? 'tags' : 'settings';
  state.ui.projectSettings = false;
  state.ui.settingsAnchor = id;
  if (entering) state.ui.layerEnter = true;
  state.ui.pendingScroll = {
    appearance: 'sec-appearance',
    repo: 'sec-repo',
    tags: 'sec-tags',
  }[id] || 'sec-appearance';
}

function moveStatus(id, dir) {
  const order = state.ui.statusOrder;
  const index = order.indexOf(id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= order.length) return;
  const [item] = order.splice(index, 1);
  order.splice(next, 0, item);
}

function updateTask(id, fn) {
  const project = currentProject();
  const task = project?.tasks.find((t) => t.id === id);
  if (!task) return null;
  fn(task);
  task.updatedAt = nowStamp();
  return task;
}

function openTask(id) {
  const owner = state.projects.find((p) => p.tasks.some((t) => t.id === id));
  if (!owner) return;
  state.modal = null;
  state.ui.projectId = owner.id;
  state.ui.activity = 'projects';
  state.ui.projectSettings = false;
  state.ui.tab = 'list';
  const task = owner.tasks.find((t) => t.id === id);
  if (task?.versionId) state.ui.listVersion = task.versionId;
  state.ui.expanded[id] = true;
  state.ui.pendingScroll = `task-${id}`;
  state.ui.search = '';
}

function openQuick(kind) {
  if (kind === 'project') {
    state.modal = {
      type: 'project',
      name: '',
      description: '',
      typeId: 'tv_none',
      platformId: 'pv_win',
      versionName: 'v0.1',
      versionTitle: '初始原型',
      modulesText: '默认模块',
    };
    return;
  }
  const project = needProject();
  if (!project) return;
  if (kind === 'task') openTaskDraft();
  else if (kind === 'bug') {
    state.ui.activity = 'projects';
    state.ui.tab = 'bugs';
    state.modal = {
      type: 'bug',
      name: '',
      summary: '',
      moduleId: project.modules[0]?.id || '',
    };
  } else if (kind === 'idea') openIdea(null);
  else if (kind === 'note') openNote(null);
}

function openTaskDraft(versionId, moduleId) {
  const project = needProject();
  if (!project) return;
  state.ui.activity = 'projects';
  state.ui.tab = 'list';
  state.modal = {
    type: 'task',
    title: '',
    description: '',
    versionId: versionId || (state.ui.listVersion !== 'all' ? state.ui.listVersion : latestVersion(project)?.id) || '',
    moduleId: moduleId || project.modules[0]?.id || '',
  };
}

function openIdea(id) {
  const project = needProject();
  if (!project) return;
  state.ui.activity = 'projects';
  state.ui.tab = 'ideas';
  if (!id) {
    state.modal = { type: 'idea', isNew: true, title: '', body: '', tagIds: [], status: 'open', taskId: null };
    return;
  }
  const idea = project.ideas.find((item) => item.id === id);
  if (!idea) return;
  state.modal = { type: 'idea', isNew: false, id: idea.id, title: idea.title, body: idea.body, tagIds: [...(idea.tagIds || [])], status: idea.status, taskId: idea.taskId };
}

function openNote(id) {
  const project = needProject();
  if (!project) return;
  state.ui.activity = 'projects';
  state.ui.projectSettings = true;
  state.ui.pendingScroll = 'sec-notes';
  if (!id) {
    state.modal = { type: 'note', isNew: true, title: '', body: '' };
    return;
  }
  const note = project.notes.find((item) => item.id === id);
  if (!note) return;
  state.modal = { type: 'note', isNew: false, id: note.id, title: note.title, body: note.body };
}

function openHit(index) {
  const hits = searchAll(state.ui.search);
  const hit = hits[index];
  if (!hit) return;
  state.ui.search = '';
  state.ui.quickOpen = false;
  if (hit.projectId) selectProject(hit.projectId);
  if (hit.typeId === 'task') openTask(hit.taskId);
  else if (hit.typeId === 'bug') {
    state.ui.tab = 'bugs';
    state.ui.activity = 'projects';
  } else if (hit.typeId === 'idea') openIdea(hit.ideaId);
  else if (hit.typeId === 'note') openNote(hit.noteId);
  else {
    state.ui.tab = 'dashboard';
    state.ui.activity = 'projects';
  }
  draw();
}

function deleteTask(id) {
  const project = currentProject();
  const task = project?.tasks.find((t) => t.id === id);
  if (!task) return;
  softDelete({ kind: 'task', name: task.title, projectId: project.id, projectName: project.name, payload: task });
  project.tasks = project.tasks.filter((t) => t.id !== id);
  project.tasks.forEach((t) => { t.dependsOn = (t.dependsOn || []).filter((d) => d !== id); });
  toast('任务已放进回收站');
}

function addSub(taskId) {
  const subId = uid('s');
  updateTask(taskId, (task) => {
    task.subtasks.push({ id: subId, title: '', description: '', done: false });
  });
  state.ui.expanded[taskId] = true;
  state.ui.pendingFocus = `sub-${subId}`;
}

function addCheck(taskId) {
  const checkId = uid('c');
  updateTask(taskId, (task) => {
    task.checks.push({ id: checkId, text: '', done: false });
  });
  state.ui.expanded[taskId] = true;
  state.ui.pendingFocus = `check-${checkId}`;
}

function deleteSub(taskId, subId) {
  const project = currentProject();
  const task = project?.tasks.find((t) => t.id === taskId);
  const sub = task?.subtasks.find((s) => s.id === subId);
  if (!sub) return;
  softDelete({ kind: 'subtask', name: sub.title, projectId: project.id, projectName: project.name, parentId: taskId, payload: sub });
  task.subtasks = task.subtasks.filter((s) => s.id !== subId);
  afterChild(task);
}

function deleteCheck(taskId, checkId) {
  const project = currentProject();
  const task = project?.tasks.find((t) => t.id === taskId);
  const check = task?.checks.find((c) => c.id === checkId);
  if (!check) return;
  softDelete({ kind: 'check', name: check.text, projectId: project.id, projectName: project.name, parentId: taskId, payload: check });
  task.checks = task.checks.filter((c) => c.id !== checkId);
  afterChild(task);
}

function afterChild(task) {
  const result = syncAuto(task);
  task.updatedAt = nowStamp();
  if (result === 'done') toast('子任务和检查项都完成了，任务已标为已完成', 'success');
  if (result === 'reopen') toast('还有没勾完的项，任务回到了进行中');
}

function addBug(moduleId) {
  const project = currentProject();
  if (!project || !moduleId) return;
  const draft = state.ui.bugDrafts[moduleId] || { name: '', summary: '' };
  const name = (draft.name || '').trim();
  if (!name) {
    toast('先写 Bug 名称', 'error');
    return;
  }
  project.bugs.push({
    id: uid('b'),
    moduleId,
    name,
    summary: (draft.summary || '').trim(),
    status: 'open',
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
  });
  state.ui.bugDrafts[moduleId] = { name: '', summary: '' };
  toast('已记下这条 Bug');
}

function deleteBug(id) {
  const project = currentProject();
  const bug = project?.bugs.find((b) => b.id === id);
  if (!bug) return;
  softDelete({ kind: 'bug', name: bug.name, projectId: project.id, projectName: project.name, payload: bug });
  project.bugs = project.bugs.filter((b) => b.id !== id);
  toast('Bug 已放进回收站');
}

async function checkForUpdate(manual) {
  if (!globalThis.pms?.checkUpdate) return;
  if (manual) {
    toast('正在检查更新');
  }
  let result;
  try {
    result = await globalThis.pms.checkUpdate();
  } catch (error) {
    if (manual) toast(error?.message || '检查更新失败', 'error');
    return;
  }
  if (!result?.ok) {
    if (manual) toast(result?.msg || '检查更新失败', 'error');
    return;
  }
  if (!result.update) {
    if (manual) toast('已经是最新版本');
    return;
  }
  if (state.modal && !manual) return;
  state.modal = { type: 'update', ...result.update };
  draw();
}

async function applyDesktopUpdate() {
  const modal = state.modal;
  if (!modal || modal.type !== 'update') return;
  if (!modal.canApply) {
    window.open(modal.pageUrl, '_blank', 'noopener');
    state.modal = null;
    draw();
    return;
  }
  const assetUrl = modal.assetUrl;
  state.modal = null;
  toast('正在下载更新，完成后会重启');
  draw();
  try {
    const result = await globalThis.pms.applyUpdate(assetUrl);
    if (!result?.ok) toast(result?.msg || '更新没有完成', 'error');
  } catch (error) {
    toast(error?.message || '更新没有完成', 'error');
  }
}

function githubFieldError(g) {
  const url = (g.url || '').trim();
  const branch = (g.branch || '').trim();
  const username = (g.username || '').trim();
  const token = (g.token || '').trim();
  if (!url) return '仓库地址是空的。';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '仓库地址格式不对。需要完整写成 https://github.com/用户名/仓库名';
  }
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'github.com' && !parsed.hostname.endsWith('.github.com'))) {
    return '仓库地址的网站不对。必须是 https://github.com/用户名/仓库名';
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return '仓库地址里缺少用户名或仓库名。格式是 https://github.com/用户名/仓库名';
  if (!branch) return '分支是空的。一般填 main。';
  if (!username) return '用户名是空的。';
  if (!token) return '个人访问令牌是空的。';
  if (token.length < 20) return '个人访问令牌太短，可能没有复制完整。';
  return '';
}

function saveGithub() {
  const g = state.settings.github;
  g.url = g.url.trim();
  g.branch = g.branch.trim() || 'main';
  g.username = g.username.trim();
  g.token = g.token.trim();
  const problem = githubFieldError(g);
  if (problem || !hasGithubFields()) {
    g.verified = false;
    g.lastError = problem || '仓库地址、用户名或令牌还有问题。';
    draw();
    return;
  }
  if (state.git.live) {
    g.lastError = '正在连接 GitHub…';
    paint();
    const result = desktopGit({ op: 'login' });
    g.verified = !!result.ok;
    g.lastError = result.ok ? '' : (result.msg || '登录失败');
    if (!result.ok) {
      draw();
      return;
    }
  }
  if (g.remembered) toast(state.desktop ? '已登录，这个仓库会记在这台电脑上' : '已登录，这个仓库会记在这台浏览器里', 'success');
  else toast('已登录。没有勾选记住仓库，退出后地址不会留着', 'success');
  draw();
}

function logout() {
  const g = state.settings.github;
  g.token = '';
  g.verified = false;
  if (!g.remembered) {
    g.url = '';
    g.username = '';
  }
  toast('已退出。推送和拉取需要重新登录');
  draw();
}

function changeKindCount(domain, dir) {
  const list = kinds(domain);
  if (dir > 0) {
    state.tagKinds.push({
      id: uid('k'),
      domain,
      name: '未命名种类',
      color: domain === 'idea' ? '#c46b3a' : '#5c6b7a',
      slot: 0,
      bindVersions: false,
      values: [{ id: uid('tv'), name: '' }],
    });
    return;
  }
  if (!list.length) return;
  const last = list[list.length - 1];
  deleteKind(last.id);
}

function deleteKind(id) {
  const kind = state.tagKinds.find((k) => k.id === id);
  if (!kind) return;
  state.projects.forEach((project) => {
    if (project.tags) delete project.tags[id];
    if (kind.domain === 'idea') {
      const ids = new Set(kind.values.map((v) => v.id));
      project.ideas.forEach((idea) => {
        idea.tagIds = (idea.tagIds || []).filter((tagId) => !ids.has(tagId));
      });
    }
  });
  state.tagKinds = state.tagKinds.filter((k) => k.id !== id);
  toast(`已去掉标签种类「${kind.name || '未命名'}」`);
}

function addValue(kindId) {
  const kind = state.tagKinds.find((k) => k.id === kindId);
  if (!kind) return;
  kind.values.push({ id: uid('tv'), name: '新标签' });
}

function deleteValue(kindId, valueId) {
  const kind = state.tagKinds.find((k) => k.id === kindId);
  if (!kind) return;
  kind.values = kind.values.filter((v) => v.id !== valueId);
  state.projects.forEach((project) => {
    if (project.tags?.[kindId] === valueId) delete project.tags[kindId];
    project.ideas.forEach((idea) => {
      idea.tagIds = (idea.tagIds || []).filter((id) => id !== valueId);
    });
  });
}

function addModule() {
  const project = currentProject();
  const name = (state.ui.newModule || '').trim();
  if (!project) return;
  if (!name) {
    toast('先写模块名称', 'error');
    return;
  }
  project.modules.push({ id: uid('m'), name });
  state.ui.newModule = '';
}

function deleteModule(id) {
  const project = currentProject();
  const mod = project?.modules.find((m) => m.id === id);
  if (!mod) return;
  const used = project.tasks.some((t) => t.moduleId === id) || project.bugs.some((b) => b.moduleId === id);
  if (used) {
    toast('这个模块下面还有任务或 Bug。先移走或删掉，再删模块', 'error');
    return;
  }
  softDelete({ kind: 'module', name: mod.name, projectId: project.id, projectName: project.name, payload: mod });
  project.modules = project.modules.filter((m) => m.id !== id);
  toast('模块已放进回收站');
}

function addVersion() {
  const project = currentProject();
  if (!project) return;
  const name = (state.ui.newVersionName || '').trim();
  const title = (state.ui.newVersionTitle || '').trim();
  if (!name) {
    toast('先写版本号', 'error');
    return;
  }
  project.versions.push({ id: uid('ver'), name, title });
  syncVersionTag(project);
  state.ui.newVersionName = '';
  state.ui.newVersionTitle = '';
  toast(`已添加 ${name}，版本标签已更新`, 'success');
}

function deleteVersion(id) {
  const project = currentProject();
  const version = project?.versions.find((v) => v.id === id);
  if (!version) return;
  if (project.tasks.some((t) => t.versionId === id)) {
    toast('还有任务挂在这个版本上。先把任务改到别的版本', 'error');
    return;
  }
  if (project.milestones.some((m) => m.versionId === id)) {
    toast('还有里程碑对应这个版本。先改里程碑的版本', 'error');
    return;
  }
  softDelete({ kind: 'version', name: version.name, projectId: project.id, projectName: project.name, payload: version });
  project.versions = project.versions.filter((v) => v.id !== id);
  syncVersionTag(project);
  toast('版本已放进回收站');
}

function addMilestone() {
  const project = currentProject();
  if (!project) return;
  if (!project.versions.length) {
    toast('先添加一个版本，里程碑需要对应版本', 'error');
    return;
  }
  project.milestones.push({
    id: uid('ms'),
    name: '新里程碑',
    versionId: latestVersion(project).id,
    status: 'upcoming',
  });
}

function deleteMilestone(id) {
  const project = currentProject();
  const item = project?.milestones.find((m) => m.id === id);
  if (!item) return;
  softDelete({ kind: 'milestone', name: item.name, projectId: project.id, projectName: project.name, payload: item });
  project.milestones = project.milestones.filter((m) => m.id !== id);
  toast('里程碑已放进回收站');
}

function askPurge(id) {
  const item = state.trash.find((t) => t.id === id);
  if (!item) return;
  state.modal = {
    type: 'confirm',
    title: '彻底删除',
    body: `「${item.name}」会从回收站消失，不能恢复。仓库里的删除仍然要等提交之后才同步。`,
    confirm: '彻底删除',
    action: 'purge',
    id,
  };
}

function confirm() {
  const modal = state.modal;
  state.modal = null;
  if (!modal) return;
  if (modal.action === 'reset') {
    reset();
    toast('已回到示例数据', 'success');
    paint();
    return;
  }
  if (modal.action === 'delete-project') {
    const project = findProject(modal.id);
    if (project) {
      softDelete({ kind: 'project', name: project.name, projectId: null, projectName: project.name, payload: project });
      state.projects = state.projects.filter((p) => p.id !== project.id);
      if (state.ui.projectId === project.id) state.ui.projectId = state.projects[0]?.id || '';
      toast('项目已放进回收站');
    }
  }
  if (modal.action === 'purge') {
    state.trash = state.trash.filter((t) => t.id !== modal.id);
    toast('已彻底删除');
  }
  draw();
}

function restoreItem(id) {
  const index = state.trash.findIndex((t) => t.id === id);
  if (index < 0) return;
  const item = state.trash[index];
  if (item.kind !== 'project') {
    const project = findProject(item.projectId);
    if (!project) {
      toast('所属项目还在回收站里，先恢复项目', 'error');
      return;
    }
    if (item.kind === 'task') project.tasks.push(item.payload);
    else if (item.kind === 'bug') project.bugs.push(item.payload);
    else if (item.kind === 'idea') project.ideas.push(item.payload);
    else if (item.kind === 'note') project.notes.push(item.payload);
    else if (item.kind === 'milestone') project.milestones.push(item.payload);
    else if (item.kind === 'module') project.modules.push(item.payload);
    else if (item.kind === 'version') {
      project.versions.push(item.payload);
      syncVersionTag(project);
    } else if (item.kind === 'subtask' || item.kind === 'check') {
      const task = project.tasks.find((t) => t.id === item.parentId);
      if (!task) {
        toast('所属任务还没恢复', 'error');
        return;
      }
      if (item.kind === 'subtask') task.subtasks.push(item.payload);
      else task.checks.push(item.payload);
      syncAuto(task);
    }
  } else {
    state.projects.push(item.payload);
    state.ui.projectId = item.payload.id;
    state.ui.activity = 'projects';
  }
  state.trash.splice(index, 1);
  toast('已恢复', 'success');
}

function desktopGit(op) {
  const g = state.settings.github;
  const result = globalThis.pms.git({
    op: op.op,
    path: op.path || '',
    message: state.git.commitMessage || '',
    url: g.url,
    branch: g.branch,
    username: g.username,
    token: g.token,
  });
  if (result?.files) {
    const data = hydrateFiles(result.files);
    state.tagKinds = data.tagKinds;
    state.projects = data.projects;
    state.trash = data.trash;
    if (!state.projects.some((project) => project.id === state.ui.projectId)) {
      state.ui.projectId = state.projects[0]?.id || '';
    }
    normalizeUi(state);
  }
  if (result?.status) applyGitStatus(result.status);
  if (op.clearMessage && result?.ok) state.git.commitMessage = '';
  return result || { ok: false, msg: '没有连上本机 Git' };
}

function runLiveGit(op) {
  if (!state.git.live) return false;
  const result = desktopGit(op);
  if (!result.ok) toast(result.msg, 'error');
  draw();
  return true;
}

function scmTool(id) {
  if (state.git.live) {
    if ((id === 'commit' || id === 'commit-push') && !(state.git.commitMessage || '').trim()) {
      toast('先写提交信息', 'error');
      return;
    }
    const result = desktopGit({
      op: id,
      clearMessage: id === 'commit' || id === 'commit-push',
    });
    toast(result.msg, result.ok ? 'success' : 'error');
    draw();
    return;
  }
  if (id === 'stage-all') {
    const local = gitChanges().filter((c) => !c.remote);
    if (!local.length) {
      toast('没有可暂存的更改');
      return;
    }
    local.forEach((c) => { state.git.staged[c.path] = true; });
    draw();
    return;
  }
  if (id === 'unstage-all') {
    state.git.staged = {};
    draw();
    return;
  }
  if (id === 'refresh') {
    const n = gitChanges().length;
    toast(n ? `已刷新，${n} 个变更` : '已刷新，工作区是干净的');
    return;
  }
  if (id === 'commit') {
    const result = commitStaged(state.git.commitMessage || '');
    toast(result.msg, result.ok ? 'success' : 'error');
    draw();
    return;
  }
  if (id === 'push') {
    const result = pushCommits();
    toast(result.msg, result.ok ? 'success' : 'error');
    draw();
    return;
  }
  if (id === 'pull') {
    const result = pullCommits();
    toast(result.msg, result.ok ? 'success' : 'error');
    draw();
    return;
  }
  if (id === 'commit-push') {
    const committed = commitStaged(state.git.commitMessage || '');
    if (!committed.ok) {
      toast(committed.msg, 'error');
      draw();
      return;
    }
    const pushed = pushCommits();
    toast(pushed.ok ? '已提交并推送' : `已提交，但推送没成功：${pushed.msg}`, pushed.ok ? 'success' : 'error');
    draw();
  }
}

function createProject() {
  const m = state.modal;
  const name = (m.name || '').trim();
  if (!name) {
    toast('先写项目名称', 'error');
    return;
  }
  const modules = (m.modulesText || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (!modules.length) {
    toast('至少留一个模块', 'error');
    return;
  }
  const project = {
    id: uid('p'),
    name,
    description: (m.description || '').trim(),
    tags: {},
    modules: modules.map((item) => ({ id: uid('m'), name: item })),
    versions: [{ id: uid('ver'), name: (m.versionName || 'v0.1').trim() || 'v0.1', title: (m.versionTitle || '').trim() }],
    milestones: [],
    tasks: [],
    bugs: [],
    ideas: [],
    notes: [],
  };
  if (m.typeId) project.tags.k_type = m.typeId;
  if (m.platformId) project.tags.k_platform = m.platformId;
  state.projects.push(project);
  syncVersionTag(project);
  state.modal = null;
  selectProject(project.id);
  toast(`已创建「${name}」`, 'success');
  draw();
}

function saveIdea() {
  const project = currentProject();
  const m = state.modal;
  if (!project || !m) return;
  const title = (m.title || '').trim();
  if (!title) {
    toast('先写想法标题', 'error');
    return;
  }
  if (m.isNew) {
    project.ideas.unshift({
      id: uid('i'),
      title,
      body: m.body || '',
      status: 'open',
      createdAt: nowStamp(),
      updatedAt: nowStamp(),
      tagIds: [...(m.tagIds || [])],
      taskId: null,
    });
  } else {
    const idea = project.ideas.find((item) => item.id === m.id);
    if (!idea) return;
    idea.title = title;
    idea.body = m.body || '';
    idea.tagIds = [...(m.tagIds || [])];
    idea.updatedAt = nowStamp();
  }
  state.modal = null;
  toast('想法已保存', 'success');
  draw();
}

function deleteCurrentIdea() {
  const project = currentProject();
  const idea = project?.ideas.find((item) => item.id === state.modal?.id);
  if (!idea) return;
  softDelete({ kind: 'idea', name: idea.title, projectId: project.id, projectName: project.name, payload: idea });
  project.ideas = project.ideas.filter((item) => item.id !== idea.id);
  state.modal = null;
  toast('想法已放进回收站');
  draw();
}

function openConvert() {
  const project = currentProject();
  const m = state.modal;
  if (!project || !m) return;
  if (!project.modules.length || !project.versions.length) {
    toast('先准备好模块和版本，再把想法转成任务', 'error');
    return;
  }
  state.modal = {
    type: 'convert',
    ideaId: m.id,
    title: m.title,
    body: m.body,
    tagIds: m.tagIds,
    versionId: latestVersion(project)?.id,
    moduleId: project.modules[0].id,
  };
  draw();
}

function doConvert() {
  const project = currentProject();
  const m = state.modal;
  const idea = project?.ideas.find((item) => item.id === m?.ideaId);
  if (!project || !idea) return;
  if (!m.moduleId || !m.versionId) {
    toast('选一个模块和版本', 'error');
    return;
  }
  const task = blankTask({
    title: idea.title,
    description: idea.body,
    versionId: m.versionId,
    moduleId: m.moduleId,
    fromIdeaId: idea.id,
  });
  project.tasks.push(task);
  idea.status = 'converted';
  idea.taskId = task.id;
  idea.updatedAt = nowStamp();
  state.modal = null;
  state.ui.tab = 'list';
  state.ui.activity = 'projects';
  state.ui.listVersion = m.versionId;
  state.ui.expanded[task.id] = true;
  state.ui.pendingScroll = `task-${task.id}`;
  toast('已转成任务，想法标成了已转任务', 'success');
  draw();
}

function createTask() {
  const project = currentProject();
  const m = state.modal;
  if (!project || !m) return;
  const title = (m.title || '').trim();
  if (!title) {
    toast('先写任务标题', 'error');
    return;
  }
  if (!m.versionId || !m.moduleId) {
    toast('选一个版本和模块', 'error');
    return;
  }
  const task = blankTask({
    title,
    description: m.description || '',
    versionId: m.versionId,
    moduleId: m.moduleId,
  });
  project.tasks.push(task);
  state.modal = null;
  state.ui.expanded[task.id] = true;
  state.ui.listVersion = m.versionId;
  state.ui.pendingScroll = `task-${task.id}`;
  toast('任务已添加');
  draw();
}

function createBug() {
  const project = currentProject();
  const m = state.modal;
  if (!project || !m) return;
  const name = (m.name || '').trim();
  if (!name) {
    toast('先写 Bug 名称', 'error');
    return;
  }
  project.bugs.push({
    id: uid('b'),
    moduleId: m.moduleId,
    name,
    summary: m.summary || '',
    status: 'open',
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
  });
  state.modal = null;
  state.ui.tab = 'bugs';
  toast('已记下这条 Bug');
  draw();
}

function saveNote() {
  const project = currentProject();
  const m = state.modal;
  if (!project || !m) return;
  const title = (m.title || '').trim();
  if (!title) {
    toast('先写笔记标题', 'error');
    return;
  }
  if (m.isNew) {
    project.notes.unshift({ id: uid('n'), title, body: m.body || '', createdAt: nowStamp(), updatedAt: nowStamp() });
  } else {
    const note = project.notes.find((item) => item.id === m.id);
    if (!note) return;
    note.title = title;
    note.body = m.body || '';
    note.updatedAt = nowStamp();
  }
  state.modal = null;
  toast('笔记已保存');
  draw();
}

function deleteCurrentNote() {
  const project = currentProject();
  const note = project?.notes.find((item) => item.id === state.modal?.id);
  if (!note) return;
  softDelete({ kind: 'note', name: note.title, projectId: project.id, projectName: project.name, payload: note });
  project.notes = project.notes.filter((item) => item.id !== note.id);
  state.modal = null;
  toast('笔记已放进回收站');
  draw();
}

function onChange(event) {
  const el = event.target.closest('[data-change]');
  if (!el) return;
  const project = currentProject();
  const id = el.dataset.id || '';
  const change = el.dataset.change;
  if (change === 'task-status') {
    updateTask(id, (task) => setTaskStatus(task, el.value));
  } else if (change === 'task-created') {
    updateTask(id, (task) => { task.createdAt = el.value; });
  } else if (change === 'task-ended') {
    updateTask(id, (task) => { task.endedAt = el.value; });
  } else if (change === 'task-auto') {
    updateTask(id, (task) => {
      task.autoComplete = el.checked;
      if (!el.checked) task.autoCompleted = false;
      else {
        const result = syncAuto(task);
        if (result === 'done') toast('子任务和检查项都完成了，任务已标为已完成', 'success');
      }
    });
  } else if (change === 'task-focus') {
    updateTask(id, (task) => { task.focus = el.value || null; });
  } else if (change === 'task-version') {
    updateTask(id, (task) => { task.versionId = el.value; });
  } else if (change === 'task-module') {
    updateTask(id, (task) => { task.moduleId = el.value; });
  } else if (change === 'sub-done') {
    const task = project?.tasks.find((t) => t.id === el.dataset.task);
    const sub = task?.subtasks.find((s) => s.id === id);
    if (sub) {
      sub.done = el.checked;
      afterChild(task);
    }
  } else if (change === 'check-done') {
    const task = project?.tasks.find((t) => t.id === el.dataset.task);
    const check = task?.checks.find((c) => c.id === id);
    if (check) {
      check.done = el.checked;
      afterChild(task);
    }
  } else if (change === 'toggle-dep') {
    const task = project?.tasks.find((t) => t.id === el.dataset.task);
    if (!task) return;
    if (el.checked) {
      if (wouldCycle(project.tasks, task.id, id)) {
        toast('这样会绕成环，依赖没有加上', 'error');
        draw();
        return;
      }
      if (!task.dependsOn.includes(id)) task.dependsOn.push(id);
    } else {
      task.dependsOn = task.dependsOn.filter((dep) => dep !== id);
    }
    task.updatedAt = nowStamp();
  } else if (change === 'bug-status') {
    const bug = project?.bugs.find((b) => b.id === id);
    if (bug && BUG_STATUSES.some((s) => s.id === el.value)) {
      bug.status = el.value;
      bug.updatedAt = nowStamp();
    }
  } else if (change === 'sort-mode') {
    state.ui.sortMode = el.value;
  } else if (change === 'idea-sort') {
    state.ui.ideaSort = el.value;
  } else if (change === 'github-remember') {
    state.settings.github.remembered = el.checked;
  } else if (change === 'kind-color') {
    const kind = state.tagKinds.find((k) => k.id === id);
    if (kind) kind.color = el.value;
  } else if (change === 'kind-slot') {
    const kind = state.tagKinds.find((k) => k.id === id);
    if (!kind) return;
    const slot = Number(el.value);
    if (slot > 0) {
      state.tagKinds.forEach((other) => {
        if (other.domain === 'project' && other.id !== kind.id && other.slot === slot) {
          other.slot = 0;
          toast(`「${other.name}」原来占着第 ${slot} 位，已让出来`);
        }
      });
    }
    kind.slot = slot;
  } else if (change === 'project-tag') {
    if (!project) return;
    project.tags = project.tags || {};
    if (!el.value) delete project.tags[el.dataset.kind];
    else project.tags[el.dataset.kind] = el.value;
  } else if (change === 'milestone-version') {
    const item = project?.milestones.find((m) => m.id === id);
    if (item) item.versionId = el.value;
  } else if (change === 'milestone-status') {
    const item = project?.milestones.find((m) => m.id === id);
    if (!item) return;
    item.status = el.value;
    if (el.value === 'current') {
      project.milestones.forEach((other) => {
        if (other.id !== item.id && other.status === 'current') other.status = 'upcoming';
      });
    }
  } else if (change === 'modal-type') {
    if (state.modal) state.modal.typeId = el.value;
  } else if (change === 'modal-platform') {
    if (state.modal) state.modal.platformId = el.value;
  } else if (change === 'idea-tag') {
    if (!state.modal) return;
    const tags = new Set(state.modal.tagIds || []);
    if (el.checked) tags.add(id);
    else tags.delete(id);
    state.modal.tagIds = [...tags];
  } else if (change === 'convert-version' || change === 'task-draft-version') {
    if (state.modal) state.modal.versionId = el.value;
  } else if (change === 'convert-module' || change === 'task-draft-module' || change === 'bug-draft-module') {
    if (state.modal) state.modal.moduleId = el.value;
  }
  draw();
}

function onInput(event) {
  const el = event.target.closest('[data-input]');
  if (!el) return;
  const project = currentProject();
  const key = el.dataset.input;
  const id = el.dataset.id || '';
  const live = el.dataset.render === 'live';
  if (key === 'search') state.ui.search = el.value;
  else if (key === 'commit') state.git.commitMessage = el.value;
  else if (key === 'idea-query') state.ui.ideaQuery = el.value;
  else if (key === 'task-title') updateTask(id, (task) => { task.title = el.value; });
  else if (key === 'task-desc') updateTask(id, (task) => { task.description = el.value; });
  else if (key === 'task-block') updateTask(id, (task) => { task.blockReason = el.value; });
  else if (key === 'sub-title') {
    const task = project?.tasks.find((t) => t.id === el.dataset.task);
    const sub = task?.subtasks.find((s) => s.id === id);
    if (sub) sub.title = el.value;
  } else if (key === 'sub-desc') {
    const task = project?.tasks.find((t) => t.id === el.dataset.task);
    const sub = task?.subtasks.find((s) => s.id === id);
    if (sub) sub.description = el.value;
  } else if (key === 'check-text') {
    const task = project?.tasks.find((t) => t.id === el.dataset.task);
    const check = task?.checks.find((c) => c.id === id);
    if (check) check.text = el.value;
  } else if (key === 'check-desc') {
    const task = project?.tasks.find((t) => t.id === el.dataset.task);
    const check = task?.checks.find((c) => c.id === id);
    if (check) check.description = el.value;
  } else if (key === 'bug-name') {
    const bug = project?.bugs.find((b) => b.id === id);
    if (bug) bug.name = el.value;
  } else if (key === 'bug-summary') {
    const bug = project?.bugs.find((b) => b.id === id);
    if (bug) bug.summary = el.value;
  } else if (key === 'bug-draft-name' || key === 'bug-draft-summary') {
    const moduleId = el.dataset.module;
    const draft = state.ui.bugDrafts[moduleId] || { name: '', summary: '' };
    if (key === 'bug-draft-name') draft.name = el.value;
    else draft.summary = el.value;
    state.ui.bugDrafts[moduleId] = draft;
  } else if (key === 'kind-name') {
    const kind = state.tagKinds.find((k) => k.id === id);
    if (kind) kind.name = el.value;
  } else if (key === 'value-name') {
    const kind = state.tagKinds.find((k) => k.id === el.dataset.kind);
    const value = kind?.values.find((v) => v.id === id);
    if (value) value.name = el.value;
  } else if (key === 'project-name' && project) project.name = el.value;
  else if (key === 'project-desc' && project) project.description = el.value;
  else if (key === 'module-name') {
    const mod = project?.modules.find((m) => m.id === id);
    if (mod) mod.name = el.value;
  } else if (key === 'version-name') {
    const version = project?.versions.find((v) => v.id === id);
    if (version) {
      version.name = el.value;
      const kind = state.tagKinds.find((k) => k.bindVersions);
      const valueId = project.tags?.[kind?.id];
      const value = kind?.values.find((v) => v.id === valueId && v.projectId === project.id);
      const latest = latestVersion(project);
      if (value && latest && version.id === latest.id) value.name = el.value;
    }
  } else if (key === 'version-title') {
    const version = project?.versions.find((v) => v.id === id);
    if (version) version.title = el.value;
  } else if (key === 'milestone-name') {
    const item = project?.milestones.find((m) => m.id === id);
    if (item) item.name = el.value;
  } else if (key === 'new-module') state.ui.newModule = el.value;
  else if (key === 'new-version-name') state.ui.newVersionName = el.value;
  else if (key === 'new-version-title') state.ui.newVersionTitle = el.value;
  else if (key === 'github-url') {
    state.settings.github.url = el.value;
    state.settings.github.verified = false;
  } else if (key === 'github-branch') state.settings.github.branch = el.value;
  else if (key === 'github-user') {
    state.settings.github.username = el.value;
    state.settings.github.verified = false;
  } else if (key === 'github-token') {
    state.settings.github.token = el.value;
    state.settings.github.verified = false;
  }
  else if (key === 'modal' && state.modal) state.modal[el.dataset.key] = el.value;
  schedulePersist({ delay: 700 });
  if (live) {
    paint({
      keepFocus: true,
      focus: {
        field: el.dataset.field,
        start: el.selectionStart,
        end: el.selectionEnd,
      },
    });
  }
}

function clampSide(value) {
  return Math.min(480, Math.max(200, Math.round(value)));
}

function onKey(event) {
  const focus = event.target instanceof Element ? event.target : null;
  if (focus?.classList.contains('side-resize') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    const next = clampSide((Number(state.ui.sidebarWidth) || 268) + (event.key === 'ArrowRight' ? 16 : -16));
    state.ui.sidebarWidth = next;
    document.querySelector('.sidebar')?.style.setProperty('--side-w', `${next}px`);
    schedulePersist();
    return;
  }
  if (focus?.classList.contains('tab') && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    reorderTab(focus.dataset.id, event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (event.key === 'Escape') {
    if (state.modal) {
      state.modal = null;
      draw();
    } else if (state.ui.quickOpen || state.ui.dashAdd || state.ui.versionMenu || state.ui.sortOpen) {
      state.ui.quickOpen = false;
      state.ui.dashAdd = false;
      state.ui.versionMenu = false;
      state.ui.sortOpen = false;
      draw();
    } else if (overlayOpen()) {
      state.ui.activity = 'projects';
      draw();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    state.ui.sidebarOpen = true;
    state.ui.activity = state.ui.activity === 'trash' ? 'trash' : state.ui.activity;
    draw();
    document.querySelector('[data-field="search"]')?.focus();
    return;
  }
  const el = event.target;
  if (event.key === 'Enter' && el.dataset?.enter) {
    event.preventDefault();
    run(el.dataset.enter, el);
    return;
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && el.dataset?.input === 'commit') {
    event.preventDefault();
    scmTool('commit');
  }
}

let draggingId = '';
let suppressClickUntil = 0;

function onDragStart(event) {
  const card = event.target.closest('[data-drag-task]');
  if (!card) return;
  if (event.target.closest('input, textarea, select')) {
    event.preventDefault();
    return;
  }
  draggingId = card.dataset.dragTask;
  card.classList.add('dragging');
  document.body.classList.add('is-dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', draggingId); } catch { /* some browsers lock the drag data */ }
  }
}

function onDragOver(event) {
  const col = event.target.closest('[data-drop]');
  if (!col || !draggingId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.column.drop-on').forEach((node) => node.classList.remove('drop-on'));
  col.classList.add('drop-on');
}

function onDrop(event) {
  const col = event.target.closest('[data-drop]');
  if (!col || !draggingId) return;
  event.preventDefault();
  const taskId = draggingId;
  clearDrop();
  updateTask(taskId, (task) => setTaskStatus(task, col.dataset.drop));
  draw();
}

function clearDrop() {
  if (draggingId) suppressClickUntil = Date.now() + 250;
  draggingId = '';
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.dragging, .drop-on').forEach((node) => node.classList.remove('dragging', 'drop-on'));
}

let tabPress = null;
let sideDrag = null;

function onPointerDown(event) {
  if (event.button !== 0) return;
  const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (origin?.closest?.('.side-resize') && !document.querySelector('.layout-compact')) {
    event.preventDefault();
    const sidebar = document.querySelector('.sidebar');
    sideDrag = {
      startX: event.clientX,
      startW: sidebar?.getBoundingClientRect().width || Number(state.ui.sidebarWidth) || 268,
    };
    sidebar?.classList.add('is-resizing');
    document.body.classList.add('is-side-drag');
    return;
  }
  const tab = origin?.closest?.('.tab');
  if (!tab || origin.closest('input, textarea, select')) return;
  tabPress = {
    id: tab.dataset.id,
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    armed: false,
    timer: setTimeout(() => armTabDrag(tab), 450),
  };
}

function armTabDrag(tab) {
  if (!tabPress || !tab.isConnected) return;
  tabPress.armed = true;
  tab.classList.add('is-dragging');
  try { tab.setPointerCapture(tabPress.pointerId); } catch { /* pointer may already be gone */ }
}

function movePressedTab(event) {
  if (!tabPress) return false;
  const dx = event.clientX - tabPress.x;
  const dy = event.clientY - tabPress.y;
  if (!tabPress.armed) {
    if (Math.hypot(dx, dy) > 8) {
      clearTimeout(tabPress.timer);
      tabPress = null;
    }
    return false;
  }
  const tabs = [...document.querySelectorAll('.tabs .tab')];
  const dragging = tabs.find((node) => node.dataset.id === tabPress.id);
  if (!dragging) return true;
  const over = tabs.find((node) => {
    const rect = node.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right;
  });
  if (!over || over === dragging) return true;
  const order = state.ui.tabOrder;
  const from = order.indexOf(tabPress.id);
  const to = order.indexOf(over.dataset.id);
  if (from < 0 || to < 0 || from === to) return true;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  const parent = dragging.parentElement;
  if (from < to) parent.insertBefore(dragging, over.nextSibling);
  else parent.insertBefore(dragging, over);
  return true;
}

function resizeSidebar(event) {
  if (!sideDrag) return false;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return true;
  const next = clampSide(sideDrag.startW + (event.clientX - sideDrag.startX));
  state.ui.sidebarWidth = next;
  sidebar.style.setProperty('--side-w', `${next}px`);
  return true;
}

function onPointerUp() {
  if (sideDrag) {
    sideDrag = null;
    document.querySelector('.sidebar')?.classList.remove('is-resizing');
    document.body.classList.remove('is-side-drag');
    persist();
  }
  if (!tabPress) return;
  clearTimeout(tabPress.timer);
  const armed = tabPress.armed;
  tabPress = null;
  document.querySelectorAll('.tab.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  if (!armed) return;
  suppressClickUntil = Date.now() + 400;
  draw();
}

function reorderTab(id, dir) {
  const order = state.ui.tabOrder || [];
  const index = order.indexOf(id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= order.length) return;
  const [item] = order.splice(index, 1);
  order.splice(next, 0, item);
  draw();
  document.querySelector(`.tab[data-id="${CSS.escape(id)}"]`)?.focus();
}

function onSettingsScroll(event) {
  const body = event.target;
  if (!(body instanceof Element) || !body.classList.contains('float-body')) return;
  const map = [
    ['sec-appearance', 'appearance'],
    ['sec-repo', 'repo'],
    ['sec-tags', 'tags'],
    ['sec-project-tags', 'tags'],
    ['sec-idea-tags', 'tags'],
  ];
  const top = body.getBoundingClientRect().top;
  let current = state.ui.settingsAnchor || 'appearance';
  for (const [id, anchor] of map) {
    const section = document.getElementById(id);
    if (!section) continue;
    if (section.getBoundingClientRect().top - top <= 72) current = anchor;
  }
  if (current === state.ui.settingsAnchor) return;
  state.ui.settingsAnchor = current;
  document.querySelectorAll('.float-panel .settings-nav .nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.id === current);
  });
}

function onDepToggle(event) {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement)) return;
  const id = details.dataset.depOpen;
  if (!id) return;
  state.ui.depOpen = state.ui.depOpen || {};
  state.ui.depOpen[id] = details.open;
  persist();
}
