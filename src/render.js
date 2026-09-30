import { icon } from './icons.js';
import { BUG_STATUSES, MILESTONE_STATUSES, TASK_STATUSES } from './seed.js';
import {
  counts,
  currentProject,
  fileLabel,
  gitChanges,
  isLoggedIn,
  kinds,
  searchAll,
  latestVersion,
  sidebarChips,
  sortTasks,
  statusLabel,
  taskProgress,
} from './store.js';
import { esc, fmt, hash, safeColor, unit } from './util.js';

const TABS = [
  ['dashboard', '仪表盘'],
  ['list', '任务'],
  ['kanban', '看板'],
  ['bugs', 'Bug'],
  ['ideas', '想法'],
];

function orderedTabs(state) {
  const labels = Object.fromEntries(TABS);
  const order = (state.ui.tabOrder || []).filter((id) => labels[id]);
  for (const [id] of TABS) if (!order.includes(id)) order.push(id);
  return order.map((id) => [id, labels[id]]);
}

function statusName(id) {
  return statusLabel(TASK_STATUSES, id);
}

function bugName(id) {
  return statusLabel(BUG_STATUSES, id);
}

function versionName(project, id) {
  const version = project.versions.find((v) => v.id === id);
  if (!version) return '未指定版本';
  return version.title ? `${version.name} ${version.title}` : version.name;
}

function moduleName(project, id) {
  return project.modules.find((m) => m.id === id)?.name || '未归类模块';
}

function waiting(project, task) {
  return (task.dependsOn || [])
    .map((id) => project.tasks.find((t) => t.id === id))
    .filter((t) => t && t.status !== 'done' && t.status !== 'abandoned');
}

function preview(text, n = 72) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

export function render(state, layout) {
  const project = currentProject();
  const side = state.ui.sidebarOpen;
  const scm = state.ui.scmOpen;
  const overlaySide = layout === 'compact' && side;
  const overlayScm = layout !== 'wide' && scm;
  return `
    <div class="shell layout-${layout} ${side ? 'side-open' : 'side-closed'} ${scm ? 'scm-open' : ''}">
      <div class="body">
        ${activity(state)}
        ${sidebar(state, project)}
        ${overlaySide ? '<button class="backdrop" type="button" data-act="close-sidebar" aria-label="关闭侧边栏"></button>' : ''}
        <div class="workspace">
          ${topbar(state, project)}
          <div class="main">${main(state, project, layout)}</div>
        </div>
        ${scmPanel(state)}
        ${overlayScm ? '<button class="backdrop scm-back" type="button" data-act="scm-toggle" aria-label="关闭源代码管理"></button>' : ''}
      </div>
      ${statusbar(state, project)}
      ${layer(state, project)}
      ${state.modal ? modal(state, project) : ''}
      ${state.toast ? `<div class="toast ${esc(state.toast.kind || 'info')}" role="status">${esc(state.toast.msg)}</div>` : ''}
    </div>`;
}

function activity(state) {
  const items = [
    ['trash', '回收站', 'trash'],
    ['settings', '全局设置', 'sliders'],
    ['tags', '标签设置', 'tag'],
  ];
  return `
    <nav class="activity" aria-label="功能">
      <button type="button" class="act-btn" data-act="toggle-sidebar" title="展开或折叠侧边栏" aria-label="展开或折叠侧边栏">${icon('menu', 22)}</button>
      <div class="act-list">
        ${items.map(([id, label, name]) => `
          <button type="button" class="act-btn ${state.ui.activity === id ? 'active' : ''}" data-act="activity" data-id="${id}" title="${label}" aria-label="${label}">
            ${icon(name, 22)}
          </button>`).join('')}
      </div>
    </nav>`;
}

function sideWidth(state) {
  const width = Number(state.ui.sidebarWidth) || 268;
  return Math.min(480, Math.max(200, width));
}

function sidebar(state, project) {
  return `
    <aside class="sidebar" style="--side-w:${sideWidth(state)}px">
      <div class="side-resize" role="separator" aria-orientation="vertical" aria-label="拖动调整侧边栏宽度" tabindex="0"></div>
      <div class="clip-side">
      <div class="side-tools">
        <div class="search-wrap">
          <span class="search-ico">${icon('search', 14)}</span>
          <input data-input="search" data-field="search" data-render="live" value="${esc(state.ui.search)}" placeholder="搜索项目、任务、Bug、想法、笔记" aria-label="全局搜索" />
          ${searchPop(state)}
        </div>
      </div>
      <div class="sidebar-scroll">
        ${sideProjects(state, project)}
      </div>
      </div>
    </aside>`;
}

function searchPop(state) {
  const q = state.ui.search.trim();
  if (!q) return '';
  const hits = searchAll(q);
  if (!hits.length) {
    return `<div class="pop search-pop"><p class="empty tight">没有匹配「${esc(q)}」的内容。</p></div>`;
  }
  return `
    <div class="pop search-pop" role="listbox">
      ${hits.map((hit, index) => `
        <button type="button" class="hit" data-act="search-hit" data-i="${index}">
          <span class="hit-type">${esc(hit.type)}</span>
          <span class="hit-title">${esc(hit.title)}</span>
          <span class="hit-hint">${esc(preview(hit.hint, 28))}</span>
        </button>`).join('')}
    </div>`;
}

function quickPop() {
  const items = [
    ['project', '新建项目'],
    ['task', '新建任务'],
    ['bug', '新建 Bug'],
    ['idea', '新建想法'],
    ['note', '新建笔记'],
  ];
  return `
    <div class="pop quick-pop">
      ${items.map(([kind, label]) => `<button type="button" data-act="quick-new" data-kind="${kind}">${label}</button>`).join('')}
    </div>`;
}

function sideProjects(state, current) {
  return `
    <button type="button" class="new-project" data-act="quick-new" data-kind="project">${icon('plus', 14)} 新建项目</button>
    <div class="side-label">项目</div>
    ${state.projects.length ? state.projects.map((p) => {
      const chips = sidebarChips(p);
      const open = !!state.ui.expandedProjects?.[p.id];
      return `
        <div class="project-block ${p.id === current?.id ? 'active' : ''}">
          <div class="project-row">
            <button type="button" class="chevron" data-act="toggle-project" data-id="${p.id}" aria-expanded="${open}" aria-label="${open ? '收起' : '展开'} ${esc(p.name)} 的模块">${icon(open ? 'chevronDown' : 'chevron', 14)}</button>
            <button type="button" class="project-main" data-act="select-project" data-id="${p.id}">
              <span class="pname">${esc(p.name)}</span>
            </button>
            ${chips.length ? `<span class="chips side-tags">${chips.map((c) => `<i class="chip" style="--chip:${safeColor(c.color)}" title="${esc(c.kind)}">${esc(c.name)}</i>`).join('')}</span>` : '<span class="chips side-tags"></span>'}
            <button type="button" class="icon-btn ghost" data-act="delete-project" data-id="${p.id}" title="删除项目" aria-label="删除 ${esc(p.name)}">${icon('trash', 14)}</button>
          </div>
          ${open ? `<div class="project-mods">${p.modules.length ? p.modules.map((mod) => `<div class="mod-chip">${esc(mod.name)}</div>`).join('') : '<p class="empty tight">还没有模块。到项目设置里加。</p>'}</div>` : ''}
        </div>`;
    }).join('') : '<p class="empty tight">还没有项目。</p>'}`;
}

function sideTrash(state) {
  const kindsCount = ['项目', '任务', 'Bug', '想法', '笔记', '里程碑', '模块', '版本', '子任务', '检查项'];
  const map = {
    project: '项目', task: '任务', bug: 'Bug', idea: '想法', note: '笔记',
    milestone: '里程碑', module: '模块', version: '版本', subtask: '子任务', check: '检查项',
  };
  const countsBy = {};
  for (const item of state.trash) countsBy[item.kind] = (countsBy[item.kind] || 0) + 1;
  return `
    <div class="side-label">回收站</div>
    <p class="hint">删掉的内容先留在这里，可以恢复。提交后，删除也会同步到仓库。</p>
    <p class="side-stat">${state.trash.length ? `${state.trash.length} 项` : '是空的'}</p>
    ${kindsCount.map((label) => {
      const id = Object.keys(map).find((k) => map[k] === label);
      const n = countsBy[id] || 0;
      if (!n) return '';
      return `<div class="side-stat-row"><span>${label}</span><b>${n}</b></div>`;
    }).join('')}`;
}

function sideSettings(state, project) {
  const items = [
    ['appearance', '外观'],
    ['repo', 'Git 仓库'],
    ['tags', '标签'],
  ];
  if (project) {
    items.push(['project', '项目信息'], ['modules', '模块'], ['versions', '版本'], ['milestones', '里程碑'], ['notes', '笔记']);
  }
  return `
    <div class="side-label">设置</div>
    ${items.map(([id, label]) => `
      <button type="button" class="nav-item ${state.ui.settingsAnchor === id ? 'active' : ''}" data-act="settings-jump" data-id="${id}">${label}</button>
    `).join('')}
    ${project ? '' : '<p class="hint">选择项目后，可以改模块、版本、里程碑和笔记。</p>'}`;
}

function viewTab(state) {
  return !state.ui.tab || state.ui.tab === 'settings' ? 'dashboard' : state.ui.tab;
}

function topbar(state, project) {
  const changes = gitChanges().length;
  const center = project
    ? `${tabstrip(state, viewTab(state))}<button type="button" class="proj-set ${state.ui.projectSettings ? 'active' : ''}" data-act="project-settings">项目设置</button>`
    : '<div class="crumb"><span class="crumb-title">项目管理</span></div>';
  return `
    <header class="topbar">
      ${center}
      <div class="scm-switches" aria-label="右侧栏">
        <button type="button" class="icon-btn" data-act="scm-toggle" title="${state.ui.scmOpen ? '折叠源代码管理' : '展开源代码管理'}" aria-label="${state.ui.scmOpen ? '折叠源代码管理' : '展开源代码管理'}">
          ${icon(state.ui.scmOpen ? 'chevron' : 'chevronLeft', 16)}
        </button>
        <button type="button" class="icon-btn scm-launch ${state.ui.scmOpen ? 'active' : ''}" data-act="scm-open" title="Source Control（Git 同步）" aria-label="Source Control">
          ${icon('git', 16)}
          ${changes ? `<span class="badge-count">${changes}</span>` : ''}
        </button>
      </div>
    </header>`;
}

function tabstrip(state, active) {
  return `
    <div class="tabs" role="tablist">
      ${orderedTabs(state).map(([id, label]) => `
        <button type="button" class="tab ${active === id ? 'active' : ''}" role="tab" aria-selected="${active === id}" data-act="tab" data-id="${id}" title="长按拖动排序，或按 Alt 加左右方向键">${label}</button>
      `).join('')}
    </div>`;
}

function main(state, project, layout) {
  if (!project) return emptyHome(state);
  if (state.ui.projectSettings) return projectSettingsPage(state, project);
  const tab = viewTab(state);
  if (tab === 'list') return listPage(state, project);
  if (tab === 'kanban') return kanbanPage(state, project);
  if (tab === 'bugs') return bugsPage(state, project);
  if (tab === 'ideas') return ideasPage(state, project, layout);
  return dashboard(state, project);
}

function layer(state, project) {
  const settings = state.ui.activity === 'settings' || state.ui.activity === 'tags' || state.ui.tab === 'settings';
  const trash = state.ui.activity === 'trash';
  if (!settings && !trash) return '';
  const title = trash ? '回收站' : '全局设置';
  return `
    <div class="float-layer" data-act="close-layer">
      <div class="float-panel ${state.ui.layerEnter ? 'is-entering' : ''}" data-act="stop" role="dialog" aria-label="${title}">
        <div class="float-head">
          <button type="button" class="back-link" data-act="back-projects">${icon('chevronLeft', 16)} 返回</button>
          <strong>${title}</strong>
        </div>
        <div class="float-body">${trash ? trashPage(state) : settingsPage(state, project)}</div>
      </div>
    </div>`;
}

function focalRow(cards) {
  return `<div class="focal">${cards.map(([label, n], index) => `
    <div class="focal-card" style="--i:${index}">
      <span>${label}</span>
      <strong data-count="${n}">${n}</strong>
    </div>`).join('')}</div>`;
}

function emptyHome(state) {
  const none = state.projects.length === 0;
  return `
    <div class="empty-hero">
      <h2>${none ? '还没有项目' : '从左侧选一个项目'}</h2>
      <p>${none
        ? '建一个游戏 Demo。模块可以先放战斗系统、移动系统，版本先从 v0.1 开始。'
        : '点左侧的项目名，中间会打开它的仪表盘、任务、看板和想法箱。'}</p>
      <button type="button" class="btn primary" data-act="quick-new" data-kind="project">新建项目</button>
    </div>`;
}

function dashboard(state, project) {
  const tasks = project.tasks;
  const stat = counts(tasks);
  const prog = taskProgress(tasks);
  const kpis = [
    ['all', '总任务数', stat.total],
    ['done', '已完成数', stat.done],
    ['todo', '待完成数', stat.todo],
    ['doing', '进行中', stat.doing],
    ['blocked', '阻塞', stat.blocked],
    ['abandoned', '放弃', stat.abandoned],
  ];
  const today = tasks.filter((t) => t.focus === 'today' && t.status !== 'done' && t.status !== 'abandoned');
  const week = tasks.filter((t) => t.focus === 'week' && t.status !== 'done' && t.status !== 'abandoned');
  const inbox = [...project.ideas].filter((i) => i.status !== 'converted').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const recentDone = [...tasks].filter((t) => t.status === 'done').sort((a, b) => (b.endedAt || '').localeCompare(a.endedAt || '')).slice(0, 5);
  const recentUp = [...tasks].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
  const chips = sidebarChips(project);
  const [hero, rest] = [kpis.slice(0, 3), kpis.slice(3)];
  return `
    <div class="page">
      <section class="hero-wrap" aria-label="任务概览">
        <div class="hero-top">
          <div>
            <p class="eyebrow">${esc(project.name)}</p>
            <p>${esc(project.description || '还没有项目简介。')}</p>
          </div>
          <div class="hero-side">
            ${chips.length ? `<div class="chips lg">${chips.map((c) => `<i class="chip" style="--chip:${safeColor(c.color)}">${esc(c.name)}</i>`).join('')}</div>` : ''}
            ${dashAdd(state)}
          </div>
        </div>
        <div class="hero">
          ${hero.map(([id, label, n], index) => `
            <button type="button" class="hero-stat hero-${id}" style="--i:${index}" data-act="kpi" data-id="${id}">
              <span>${label}</span>
              <strong data-count="${n}">${n}</strong>
            </button>`).join('')}
        </div>
      </section>
      <div class="kpis">
        ${rest.map(([id, label, n]) => `
          <button type="button" class="kpi kpi-${id}" data-act="kpi" data-id="${id}">
            <span>${label}</span>
            <strong data-count="${n}">${n}</strong>
          </button>`).join('')}
      </div>
      <section class="panel">
        <div class="panel-h"><h3>进度</h3><span class="hint">${prog.done} / ${prog.total || 0} 已完成</span></div>
        <div class="mod-table">
          <div class="mod-row mod-card is-lead">
            <span class="mod-label">项目</span>
            ${bar(prog.pct, 'live')}
            <span class="mod-pct">${prog.pct}%</span>
          </div>
          ${project.modules.length ? project.modules.map((mod) => {
            const list = tasks.filter((t) => t.moduleId === mod.id);
            const p = taskProgress(list);
            return `
              <div class="mod-row mod-card">
                <span class="mod-label">${esc(mod.name)}</span>
                ${bar(list.length ? p.pct : 0, list.length ? 'live' : 'live is-empty')}
                <span class="mod-pct">${list.length ? `${p.pct}%` : '—'}</span>
              </div>`;
          }).join('') : '<p class="empty">还没有模块。到项目设置里加一个，比如战斗系统。</p>'}
        </div>
      </section>
      <section class="panel">
        <div class="panel-h">
          <h3>里程碑</h3>
          <button type="button" class="btn tiny" data-act="settings-jump" data-id="milestones">编辑</button>
        </div>
        ${milestoneTrack(project)}
      </section>
      <div class="split">
        <section class="panel">
          <div class="panel-h"><h3>今日 / 本周聚焦</h3></div>
          <h4 class="subhead">今日</h4>
          ${focusList(project, today, '今天还没有聚焦。打开任务列表，把要紧的标成今日。')}
          <h4 class="subhead">本周</h4>
          ${focusList(project, week, '本周还没有聚焦任务。')}
        </section>
        <section class="panel">
          <div class="panel-h">
            <h3>想法收件箱</h3>
            <button type="button" class="btn tiny" data-act="tab" data-id="ideas">打开想法箱</button>
          </div>
          ${inbox.length ? inbox.map((idea) => `
            <button type="button" class="link-row" data-act="open-idea" data-id="${idea.id}">
              <span>${esc(idea.title)}</span>
              <em>${fmt(idea.createdAt)}</em>
            </button>`).join('') : '<p class="empty">收件箱是空的。还没变成需求的念头，先丢进想法箱。</p>'}
        </section>
      </div>
      <div class="split">
        <section class="panel">
          <div class="panel-h"><h3>最近完成</h3></div>
          ${recentDone.length ? recentDone.map((t) => taskLink(project, t, fmt(t.endedAt))).join('') : '<p class="empty">还没有完成的任务。</p>'}
        </section>
        <section class="panel">
          <div class="panel-h"><h3>最近更新</h3></div>
          ${recentUp.length ? recentUp.map((t) => taskLink(project, t, fmt(t.updatedAt))).join('') : '<p class="empty">还没有任务。</p>'}
        </section>
      </div>
    </div>`;
}

function dashAdd(state) {
  const items = [
    ['task', '新建任务'],
    ['bug', '新建 Bug'],
    ['idea', '新建想法'],
    ['note', '新建笔记'],
  ];
  return `
    <div class="dash-add menu-anchor">
      <button type="button" class="add-btn" data-act="toggle-dash-add" aria-expanded="${state.ui.dashAdd ? 'true' : 'false'}"><span aria-hidden="true">＋</span>添加</button>
      ${state.ui.dashAdd ? `<div class="soft-pop" role="menu">${items.map(([kind, label]) => `<button type="button" role="menuitem" data-act="quick-new" data-kind="${kind}">${label}</button>`).join('')}</div>` : ''}
    </div>`;
}

function addButton(label, attrs) {
  return `<button type="button" class="add-btn" ${attrs}><span aria-hidden="true">＋</span>${label}</button>`;
}

function taskBits(task) {
  const items = [...(task.subtasks || []), ...(task.checks || [])];
  if (!items.length) {
    return task.status === 'done'
      ? { pct: 100, label: '完成' }
      : { pct: 0, label: '未开始' };
  }
  const done = items.filter((item) => item.done).length;
  return { pct: Math.round((done / items.length) * 100), label: `${done}/${items.length}` };
}

function bar(pct, extra = '') {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="bar ${extra}"><span style="--w:${w}%"></span></div>`;
}

function focusList(project, tasks, empty) {
  if (!tasks.length) return `<p class="empty">${empty}</p>`;
  return tasks.map((t) => `
    <div class="link-row static">
      <button type="button" data-act="open-task" data-id="${t.id}">${esc(t.title)}</button>
      <span class="status st-${t.status}">${statusName(t.status)}</span>
      <button type="button" class="btn tiny" data-act="clear-focus" data-id="${t.id}">取消</button>
    </div>`).join('');
}

function taskLink(project, task, meta) {
  return `
    <button type="button" class="link-row" data-act="open-task" data-id="${task.id}">
      <span>${esc(task.title)}</span>
      <em>${esc(moduleName(project, task.moduleId))} · ${esc(meta)}</em>
    </button>`;
}

function milestoneTrack(project) {
  if (!project.milestones.length) {
    return '<p class="empty">还没有里程碑。版本用来挂任务，里程碑只做展示。</p>';
  }
  const rank = { done: 0, current: 1, upcoming: 2 };
  const items = [...project.milestones].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  return `
    <div class="timeline" role="list">
      <div class="timeline-line" aria-hidden="true"><i></i></div>
      ${items.map((m, index) => `
        <div class="ms ms-${m.status}" role="listitem" style="--i:${index}">
          <i class="ms-node"></i>
          <div class="ms-card">
            <strong>${esc(m.name)}</strong>
            <span>${esc(versionName(project, m.versionId))}</span>
            <em>${esc(statusLabel(MILESTONE_STATUSES, m.status))}</em>
          </div>
        </div>`).join('')}
    </div>`;
}

function shownVersion(state, project) {
  const picked = project.versions.find((v) => v.id === state.ui.listVersion);
  return picked || latestVersion(project);
}

function listPage(state, project) {
  const versions = project.versions;
  const current = shownVersion(state, project);
  const groups = current ? [current] : [];
  return `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>任务</h1>
          <p>先看状态，再看标题、模块和进度。默认只显示最新版本。</p>
        </div>
      </header>
      ${focalRow([['任务', counts(project.tasks).total], ['进行中', counts(project.tasks).doing], ['阻塞', counts(project.tasks).blocked]])}
      <div class="toolbar one-row">
        <div class="ver-label">
          <span>版本</span>
          <strong>${current ? `${esc(current.name)} ${esc(current.title || '')}` : '还没有版本'}</strong>
        </div>
        <div class="row-end">
          <div class="menu-anchor">
            <button type="button" class="btn" data-act="toggle-versions" aria-expanded="${state.ui.versionMenu ? 'true' : 'false'}">其他版本</button>
            ${state.ui.versionMenu ? `<div class="soft-pop">${versions.map((v) => `<button type="button" class="${current?.id === v.id ? 'on' : ''}" data-act="version-filter" data-scope="list" data-id="${v.id}">${esc(v.name)} ${esc(v.title || '')}</button>`).join('') || '<p class="empty tight">到项目设置里新建版本。</p>'}</div>` : ''}
          </div>
          <div class="menu-anchor">
            <button type="button" class="btn" data-act="toggle-sort" aria-expanded="${state.ui.sortOpen ? 'true' : 'false'}">排序</button>
            ${state.ui.sortOpen ? `
              <div class="soft-pop sort-pop">
                <label class="stack">顺序
                  <select data-change="sort-mode" aria-label="排序">
                    ${[['status', '按状态'], ['created', '按创建时间'], ['ended', '按结束时间'], ['title', '按名称']].map(([id, label]) => `<option value="${id}" ${state.ui.sortMode === id ? 'selected' : ''}>${label}</option>`).join('')}
                  </select>
                </label>
                <button type="button" class="btn" data-act="sort-dir">${state.ui.sortDir === 'asc' ? '升序' : '降序'}</button>
                ${state.ui.sortMode === 'status' ? statusOrderEditor(state) : ''}
              </div>` : ''}
          </div>
          ${addButton('添加任务', 'data-act="add-task"')}
        </div>
      </div>
      ${state.ui.statusFilter !== 'all' ? `<div class="filter-banner">正在看：${esc(state.ui.statusFilter === 'todo' ? '待完成' : statusName(state.ui.statusFilter))}<button type="button" data-act="clear-filter">清除</button></div>` : ''}
      <p class="hint">当前版本里按模块分组。换版本用右边的「其他版本」。</p>
      ${groups.length ? groups.map((v) => versionBlock(state, project, v)).join('') : '<p class="empty">还没有版本。到项目设置里新建一个。</p>'}
    </div>`;
}

function statusOrderEditor(state) {
  return `
    <div class="order-bar">
      <span>状态顺序</span>
      ${state.ui.statusOrder.map((id) => `
        <span class="order-chip">
          <button type="button" data-act="status-move" data-id="${id}" data-dir="-1" aria-label="前移 ${statusName(id)}">↑</button>
          ${statusName(id)}
          <button type="button" data-act="status-move" data-id="${id}" data-dir="1" aria-label="后移 ${statusName(id)}">↓</button>
        </span>`).join('')}
    </div>`;
}

function versionBlock(state, project, version) {
  return `
    <section class="version-block">
      <h2>${esc(version.name)} <small>${esc(version.title || '')}</small></h2>
      ${project.modules.length ? project.modules.map((mod) => moduleBlock(state, project, version, mod)).join('') : '<p class="empty">这个项目还没有模块。</p>'}
    </section>`;
}

function moduleBlock(state, project, version, mod) {
  const all = project.tasks.filter((t) => t.versionId === version.id && t.moduleId === mod.id);
  let tasks = all;
  if (state.ui.statusFilter !== 'all') tasks = tasks.filter((t) => t.status === state.ui.statusFilter);
  tasks = sortTasks(tasks);
  return `
    <div class="module-block">
      <div class="module-h">
        <h3>${esc(mod.name)}</h3>
        <span class="muted">${all.length} 个任务</span>
      </div>
      <div class="task-scroll">
      <div class="task-head" aria-hidden="true"><span></span><span>状态</span><span>任务</span><span>模块</span><span>进度</span><span>创建</span><span>结束</span><span></span></div>
      ${tasks.length ? tasks.map((task) => taskRow(state, project, task)).join('') : `<p class="empty">${all.length ? '没有符合筛选的任务。' : '此模块在这个版本下还没有任务。'}</p>`}
      </div>
    </div>`;
}

function taskRow(state, project, task) {
  const open = !!state.ui.expanded[task.id];
  const waits = waiting(project, task);
  const bits = taskBits(task);
  return `
    <article class="task ${open ? 'open' : ''}" id="task-${task.id}">
      <div class="task-row">
        <button type="button" class="chevron" data-act="expand" data-id="${task.id}" aria-label="${open ? '折叠' : '展开'}">${icon(open ? 'chevronDown' : 'chevron', 14)}</button>
        <select class="cell status-cell st-${task.status}" data-change="task-status" data-id="${task.id}" aria-label="任务状态">
          ${TASK_STATUSES.map((s) => `<option value="${s.id}" ${task.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <div class="task-main">
          <input data-input="task-title" data-field="title-${task.id}" data-id="${task.id}" value="${esc(task.title)}" aria-label="任务名称" />
          ${task.focus || waits.length || task.fromIdeaId ? `<div class="task-subline">
            ${task.focus ? `<span class="pill">${task.focus === 'today' ? '今日' : '本周'}</span>` : ''}
            ${waits.length ? `<span class="pill warn">等待 ${esc(waits.map((t) => t.title).join('、'))}</span>` : ''}
            ${task.fromIdeaId ? '<span class="pill">来自想法</span>' : ''}
          </div>` : ''}
        </div>
        <span class="task-module">${esc(moduleName(project, task.moduleId))}</span>
        <div class="task-prog" title="子任务和检查项">
          ${bar(bits.pct, 'mini live')}
          <em>${bits.label}</em>
        </div>
        <input class="cell" type="datetime-local" data-change="task-created" data-id="${task.id}" value="${esc(task.createdAt)}" aria-label="创建时间" />
        <input class="cell" type="datetime-local" data-change="task-ended" data-id="${task.id}" value="${esc(task.endedAt)}" aria-label="结束时间" />
        <button type="button" class="icon-btn" data-act="delete-task" data-id="${task.id}" title="删除任务">${icon('trash', 14)}</button>
      </div>
      <div class="task-fold ${open ? 'open' : ''}" ${open ? '' : 'inert'}>
        <div class="task-fold-inner">${taskDetail(state, project, task)}</div>
      </div>
    </article>`;
}

function foldTri(open, id) {
  return `<button type="button" class="fold-tri ${open ? 'open' : ''}" data-act="toggle-desc" data-id="${id}" aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? '收起描述' : '展开描述'}"><i></i></button>`;
}

function taskDetail(state, project, task) {
  const metaOpen = !!state.ui.taskMeta?.[task.id];
  return `
    <div class="task-detail">
      <div class="detail-tools">
        <span>详细描述</span>
        <button type="button" class="btn" data-act="toggle-task-meta" data-id="${task.id}" aria-expanded="${metaOpen ? 'true' : 'false'}">其他设置</button>
      </div>
      <textarea data-input="task-desc" data-id="${task.id}" rows="3" aria-label="详细描述">${esc(task.description)}</textarea>
      ${metaOpen ? `
        <div class="meta-group">
          <div class="detail-grid">
            <label>版本
              <select data-change="task-version" data-id="${task.id}">
                ${project.versions.map((v) => `<option value="${v.id}" ${task.versionId === v.id ? 'selected' : ''}>${esc(versionName(project, v.id))}</option>`).join('')}
              </select>
            </label>
            <label>模块
              <select data-change="task-module" data-id="${task.id}">
                ${project.modules.map((m) => `<option value="${m.id}" ${task.moduleId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
              </select>
            </label>
            <label>聚焦
              <select data-change="task-focus" data-id="${task.id}">
                <option value="" ${!task.focus ? 'selected' : ''}>不聚焦</option>
                <option value="today" ${task.focus === 'today' ? 'selected' : ''}>今日</option>
                <option value="week" ${task.focus === 'week' ? 'selected' : ''}>本周</option>
              </select>
            </label>
          </div>
          <label class="checkline">
            <input type="checkbox" data-change="task-auto" data-id="${task.id}" ${task.autoComplete ? 'checked' : ''} />
            <span>子任务和检查项都完成时，自动标为已完成</span>
          </label>
          ${task.autoComplete ? '' : '<p class="hint">已关掉自动完成，可以自己保持现在的状态。</p>'}
        </div>` : ''}
      ${task.status === 'blocked' ? `
        <label class="stack">阻塞原因
          <input data-input="task-block" data-id="${task.id}" value="${esc(task.blockReason)}" placeholder="为什么卡住了" />
        </label>` : ''}
      <section class="detail-block">
        <div class="child-h"><h4>检查项</h4>${addButton('添加检查项', `data-act="add-check" data-id="${task.id}"`)}</div>
        ${task.checks.length ? task.checks.map((c) => {
          const showDesc = !!state.ui.subDesc?.[c.id];
          return `
          <div class="child-block">
            <div class="child-row">
              <input type="checkbox" data-change="check-done" data-task="${task.id}" data-id="${c.id}" ${c.done ? 'checked' : ''} aria-label="完成检查项" />
              <input data-input="check-text" data-field="check-${c.id}" data-task="${task.id}" data-id="${c.id}" value="${esc(c.text)}" placeholder="检查项名称" aria-label="检查项" />
              ${foldTri(showDesc, c.id)}
              <button type="button" class="icon-btn" data-act="delete-check" data-task="${task.id}" data-id="${c.id}" aria-label="删除检查项">${icon('close', 14)}</button>
            </div>
            <div class="desc-fold ${showDesc ? 'open' : ''}">
              <div class="desc-fold-inner">
                <textarea class="child-desc" data-input="check-desc" data-task="${task.id}" data-id="${c.id}" rows="2" placeholder="描述可选" aria-label="检查项描述">${esc(c.description || '')}</textarea>
              </div>
            </div>
          </div>`;
        }).join('') : '<p class="empty tight">父任务还没有自己的检查项。</p>'}
      </section>
      <section class="detail-block">
        <div class="child-h"><h4>子任务</h4>${addButton('添加子任务', `data-act="add-sub" data-id="${task.id}"`)}</div>
        ${task.subtasks.length ? task.subtasks.map((s) => {
          const showDesc = !!state.ui.subDesc?.[s.id];
          return `
          <div class="child-block">
            <div class="child-row">
              <input type="checkbox" data-change="sub-done" data-task="${task.id}" data-id="${s.id}" ${s.done ? 'checked' : ''} aria-label="完成子任务" />
              <input data-input="sub-title" data-field="sub-${s.id}" data-task="${task.id}" data-id="${s.id}" value="${esc(s.title)}" placeholder="子任务名称" aria-label="子任务" />
              ${foldTri(showDesc, s.id)}
              <button type="button" class="icon-btn" data-act="delete-sub" data-task="${task.id}" data-id="${s.id}" aria-label="删除子任务">${icon('close', 14)}</button>
            </div>
            <div class="desc-fold ${showDesc ? 'open' : ''}">
              <div class="desc-fold-inner">
                <textarea class="child-desc" data-input="sub-desc" data-task="${task.id}" data-id="${s.id}" rows="2" placeholder="描述可选" aria-label="子任务描述">${esc(s.description || '')}</textarea>
              </div>
            </div>
          </div>`;
        }).join('') : '<p class="empty tight">还没有子任务。</p>'}
      </section>
      <section class="detail-block">
        <h4>依赖</h4>
        <p class="hint">勾上的任务要先完成。看板和依赖图会一起变。</p>
        ${depList(project, task)}
      </section>
    </div>`;
}

function depList(project, task) {
  const others = project.tasks.filter((t) => t.id !== task.id);
  if (!others.length) return '<p class="empty tight">还没有其他任务可以依赖。</p>';
  return `<div class="dep-list">${others.map((o) => `
    <label class="checkline">
      <input type="checkbox" data-change="toggle-dep" data-task="${task.id}" data-id="${o.id}" ${(task.dependsOn || []).includes(o.id) ? 'checked' : ''} />
      <span>${esc(o.title)}</span>
      <em class="status st-${o.status}">${statusName(o.status)}</em>
    </label>`).join('')}</div>`;
}

function shownKanbanVersion(state, project) {
  const picked = project.versions.find((v) => v.id === state.ui.kanbanVersion);
  return picked || latestVersion(project);
}

function kanbanPage(state, project) {
  const current = shownKanbanVersion(state, project);
  const tasks = current ? project.tasks.filter((t) => t.versionId === current.id) : [];
  return `
    <div class="page page-board">
      <header class="page-head">
        <div>
          <h1>看板</h1>
          <p>按状态分列。默认只看最新版本，拖过去，列表里的状态会一起改。</p>
        </div>
        ${addButton('添加任务', 'data-act="add-task"')}
      </header>
      ${focalRow([
        ['看板上', tasks.length],
        ['进行中', tasks.filter((t) => t.status === 'doing').length],
        ['阻塞', tasks.filter((t) => t.status === 'blocked').length],
      ])}
      <div class="toolbar one-row">
        <div class="ver-label">
          <span>版本</span>
          <strong>${current ? `${esc(current.name)} ${esc(current.title || '')}` : '还没有版本'}</strong>
        </div>
        <div class="row-end">
          <div class="seg">
            <button type="button" class="${state.ui.kanbanMode === 'board' ? 'on' : ''}" data-act="kanban-mode" data-id="board">看板</button>
            <button type="button" class="${state.ui.kanbanMode === 'graph' ? 'on' : ''}" data-act="kanban-mode" data-id="graph">依赖图</button>
          </div>
          <div class="menu-anchor">
            <button type="button" class="btn" data-act="toggle-versions" aria-expanded="${state.ui.versionMenu ? 'true' : 'false'}">其他版本</button>
            ${state.ui.versionMenu ? `<div class="soft-pop">${project.versions.map((v) => `<button type="button" class="${current?.id === v.id ? 'on' : ''}" data-act="version-filter" data-scope="kanban" data-id="${v.id}">${esc(v.name)} ${esc(v.title || '')}</button>`).join('') || '<p class="empty tight">到项目设置里新建版本。</p>'}</div>` : ''}
          </div>
        </div>
      </div>
      ${state.ui.kanbanMode === 'graph' ? graphView(state, project, tasks) : boardView(state, project, tasks)}
    </div>`;
}

function boardView(state, project, tasks) {
  if (!project.tasks.length) {
    return '<div class="empty-hero slim"><h2>看板是空的</h2><p>先在任务列表里加一条任务。拖到别的列，列表里的状态会一起改。</p></div>';
  }
  return `
    <div class="board">
      ${state.ui.statusOrder.map((status) => {
        const cards = tasks.filter((t) => t.status === status);
        return `
          <section class="column" data-drop="${status}">
            <header class="col-h col-${status}"><span class="status st-${status}">${statusName(status)}</span><em>${cards.length}</em></header>
            <div class="column-body">
              ${cards.length ? cards.map((task) => card(state, project, task)).join('') : '<p class="empty tight">没有任务</p>'}
            </div>
          </section>`;
      }).join('')}
    </div>`;
}

function card(state, project, task) {
  const waits = waiting(project, task);
  return `
    <article class="kcard" draggable="true" data-drag-task="${task.id}">
      <div class="kcard-title" role="button" tabindex="0" data-act="open-task" data-id="${task.id}">${esc(task.title)}</div>
      <p class="kcard-meta">${esc(moduleName(project, task.moduleId))} · ${esc(versionName(project, task.versionId))}</p>
      ${task.status === 'blocked' ? `
        <label class="stack tight">阻塞原因
          <input data-input="task-block" data-id="${task.id}" value="${esc(task.blockReason)}" placeholder="填写阻塞原因" />
        </label>` : ''}
      ${waits.length ? `<p class="kcard-wait">等待：${esc(waits.map((t) => t.title).join('、'))}</p>` : ''}
      <details class="card-deps" data-dep-open="${task.id}" ${state.ui.depOpen?.[task.id] ? 'open' : ''}>
        <summary>依赖</summary>
        ${depList(project, task)}
      </details>
    </article>`;
}

function graphView(state, project, tasks) {
  if (!tasks.length) return '<p class="empty">这个版本还没有任务，依赖图是空的。</p>';
  const colW = 220;
  const rowH = 92;
  const positions = {};
  let maxCols = 1;
  project.modules.forEach((mod, row) => {
    const list = tasks.filter((t) => t.moduleId === mod.id);
    maxCols = Math.max(maxCols, list.length || 1);
    list.forEach((task, index) => {
      positions[task.id] = { x: 12 + index * colW, y: 12 + row * rowH };
    });
  });
  const width = Math.max(520, 24 + maxCols * colW);
  const height = 24 + Math.max(project.modules.length, 1) * rowH;
  const arrows = [];
  for (const task of tasks) {
    const to = positions[task.id];
    if (!to) continue;
    for (const depId of task.dependsOn || []) {
      const from = positions[depId];
      if (!from) continue;
      const x1 = from.x + 180;
      const y1 = from.y + 28;
      const x2 = to.x + 8;
      const y2 = to.y + 28;
      const mid = (x1 + x2) / 2;
      arrows.push(`<path class="flow" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" marker-end="url(#arrow)" />`);
    }
  }
  const selected = tasks.find((t) => t.id === state.ui.graphTaskId) || tasks[0];
  return `
    <p class="hint">箭头从被依赖的任务指向后面的任务。点一个任务，可以改它的依赖。</p>
    <div class="graph-scroll">
      <div class="graph" style="width:${width}px;height:${height}px">
        <svg width="${width}" height="${height}" aria-hidden="true">
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" /></marker></defs>
          ${arrows.join('')}
        </svg>
        ${tasks.filter((t) => positions[t.id]).map((task) => {
          const pos = positions[task.id];
          return `<button type="button" class="gnode st-line-${task.status} ${selected?.id === task.id ? 'selected' : ''}" style="left:${pos.x}px;top:${pos.y}px" data-act="graph-select" data-id="${task.id}">
            <strong>${esc(task.title)}</strong>
            <span>${esc(moduleName(project, task.moduleId))} · ${statusName(task.status)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
    ${selected ? `<section class="panel"><h3>${esc(selected.title)} 的依赖</h3>${depList(project, selected)}</section>` : ''}`;
}

function bugsPage(state, project) {
  const modules = project.modules.length ? project.modules : [];
  return `
    <div class="page">
      <header class="page-head slim">
        <div>
          <h1>Bug</h1>
          <p>按模块记。状态只有待修复、修复中、已修复、已无关。</p>
        </div>
        ${addButton('添加 Bug', 'data-act="quick-new" data-kind="bug"')}
      </header>
      ${focalRow([
        ['Bug', project.bugs.length],
        ['待修复', project.bugs.filter((b) => b.status === 'open').length],
        ['修复中', project.bugs.filter((b) => b.status === 'fixing').length],
      ])}
      ${modules.length ? modules.map((mod) => bugGroup(state, project, mod)).join('') : '<p class="empty">先在项目设置里添加模块，再记 Bug。</p>'}
    </div>`;
}

function bugGroup(state, project, mod) {
  const bugs = project.bugs.filter((b) => b.moduleId === mod.id);
  return `
    <section class="module-block">
      <div class="module-h"><h3>${esc(mod.name)}</h3><span class="muted">${bugs.length} 个</span></div>
      <div class="bug-scroll">
        <div class="bug-table">
          <div class="bug-row bug-head"><span>名称</span><span>简述</span><span>状态</span><span></span></div>
          ${bugs.length ? bugs.map((bug) => `
            <div class="bug-row">
              <input data-input="bug-name" data-id="${bug.id}" value="${esc(bug.name)}" aria-label="Bug 名称" />
              <input data-input="bug-summary" data-id="${bug.id}" value="${esc(bug.summary)}" aria-label="Bug 简述" />
              <select data-change="bug-status" data-id="${bug.id}" aria-label="Bug 状态">
                ${BUG_STATUSES.map((s) => `<option value="${s.id}" ${bug.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>
              <button type="button" class="icon-btn" data-act="delete-bug" data-id="${bug.id}" aria-label="删除 Bug">${icon('trash', 14)}</button>
            </div>`).join('') : '<p class="empty">这个模块还没有 Bug。</p>'}
        </div>
      </div>
    </section>`;
}

function ideasPage(state, project) {
  const q = state.ui.ideaQuery.trim().toLowerCase();
  let ideas = [...project.ideas];
  if (state.ui.ideaStatus === 'open') ideas = ideas.filter((i) => i.status !== 'converted');
  if (state.ui.ideaStatus === 'converted') ideas = ideas.filter((i) => i.status === 'converted');
  if (q) {
    ideas = ideas.filter((i) => `${i.title} ${i.body}`.toLowerCase().includes(q) || ideaTagNames(i).some((n) => n.toLowerCase().includes(q)));
  }
  ideas.sort((a, b) => {
    if (state.ui.ideaSort === 'tag') {
      const cmp = (ideaTagNames(a)[0] || '').localeCompare(ideaTagNames(b)[0] || '', 'zh');
      return state.ui.ideaDir === 'asc' ? cmp : -cmp;
    }
    const cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
    return state.ui.ideaDir === 'asc' ? cmp : -cmp;
  });
  return `
    <div class="page ideas-page">
      <header class="page-head">
        <div>
          <h1>想法箱</h1>
          <p>还没写成需求的念头，按列表记在这里。</p>
        </div>
        ${addButton('添加想法', 'data-act="new-idea"')}
      </header>
      ${focalRow([
        ['想法', project.ideas.length],
        ['未转任务', project.ideas.filter((i) => i.status !== 'converted').length],
        ['已转任务', project.ideas.filter((i) => i.status === 'converted').length],
      ])}
      <div class="toolbar one-row">
        <input data-input="idea-query" data-field="idea-query" data-render="live" value="${esc(state.ui.ideaQuery)}" placeholder="搜索想法" aria-label="搜索想法" />
        <div class="seg">
          <button type="button" class="${state.ui.ideaStatus === 'all' ? 'on' : ''}" data-act="idea-status" data-id="all">全部</button>
          <button type="button" class="${state.ui.ideaStatus === 'open' ? 'on' : ''}" data-act="idea-status" data-id="open">未转任务</button>
          <button type="button" class="${state.ui.ideaStatus === 'converted' ? 'on' : ''}" data-act="idea-status" data-id="converted">已转任务</button>
        </div>
        <label class="inline">顺序
          <select data-change="idea-sort" aria-label="想法排序">
            <option value="created" ${state.ui.ideaSort === 'created' ? 'selected' : ''}>创建时间</option>
            <option value="tag" ${state.ui.ideaSort === 'tag' ? 'selected' : ''}>标签</option>
          </select>
        </label>
        <button type="button" class="btn" data-act="idea-dir">${state.ui.ideaDir === 'desc' ? '新的在前' : '旧的在前'}</button>
      </div>
      ${ideas.length ? `<div class="idea-list">${ideas.map((idea) => `
        <button type="button" class="idea-row" data-act="open-idea" data-id="${idea.id}">
          <span class="idea-title">${esc(idea.title)}</span>
          <span class="idea-preview">${esc(preview(idea.body, 72))}</span>
          <span class="idea-meta">${ideaTagsHtml(idea) || '<i class="muted">无标签</i>'}<em>${fmt(idea.createdAt)}</em>${idea.status === 'converted' ? '<i class="pill">已转任务</i>' : ''}</span>
        </button>`).join('')}</div>` : `<div class="empty-hero slim"><h2>${q ? '没有这样的想法' : '想法箱是空的'}</h2><p>${q ? '换个词，或者清掉搜索。' : '记下一句，之后可以转成某个模块里的任务。'}</p></div>`}
    </div>`;
}

function ideaTagNames(idea) {
  const names = [];
  for (const kind of kinds('idea')) {
    for (const value of kind.values) {
      if ((idea.tagIds || []).includes(value.id)) names.push(value.name);
    }
  }
  return names;
}

function ideaTagsHtml(idea) {
  const bits = [];
  for (const kind of kinds('idea')) {
    for (const value of kind.values) {
      if ((idea.tagIds || []).includes(value.id)) {
        bits.push(`<i class="chip" style="--chip:${safeColor(kind.color)}">${esc(value.name)}</i>`);
      }
    }
  }
  return bits.join('');
}

function messyStyle(id, index, cols) {
  const rz = (unit(hash(`${id}:r`)) * 22 - 11).toFixed(2);
  const rx = (unit(hash(`${id}:rx`)) * 20 + 6).toFixed(2);
  const ry = (unit(hash(`${id}:ry`)) * 24 - 12).toFixed(2);
  const z = Math.round(16 + unit(hash(`${id}:z`)) * 36);
  const pose = `--rx:${rx}deg;--ry:${ry}deg;--rz:${rz}deg;--z:${z}px`;
  if (cols === 1) return { css: pose, rows: index + 1 };
  const width = 210 + Math.floor(unit(hash(`${id}:w`)) * 48);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const jx = Math.round((unit(hash(`${id}:x`)) - 0.5) * 36);
  const jy = Math.round((unit(hash(`${id}:y`)) - 0.5) * 28);
  const left = 18 + col * 250 + jx;
  const top = 22 + row * 230 + jy;
  return {
    css: `width:${width}px;left:${left}px;top:${top}px;${pose};z-index:${10 + index}`,
    rows: row + 1,
  };
}

function sheet(project, idea, messy, style, cols) {
  const tags = ideaTagsHtml(idea);
  const pose = style.includes('--rx') ? style : `${style};--rx:8deg;--ry:-6deg;--rz:0deg;--z:12px`;
  return `
    <button type="button" class="sheet ${messy ? 'abs' : ''} ${cols === 1 && messy ? 'stack' : ''}" style="${pose}" data-act="open-idea" data-id="${idea.id}">
      <span class="paper">
        <span class="paper-edge" aria-hidden="true"></span>
        <span class="paper-side paper-side-y" aria-hidden="true"></span>
        <span class="paper-side paper-side-x" aria-hidden="true"></span>
        <span class="paper-face">
          <span class="paper-fold" aria-hidden="true"></span>
          ${idea.status === 'converted' ? '<span class="stamp">已转任务</span>' : ''}
          <span class="sheet-title">${esc(idea.title)}</span>
          <span class="sheet-preview">${esc(preview(idea.body, 86))}</span>
          <span class="sheet-foot">${tags || '<i class="muted">无标签</i>'}<em>${fmt(idea.createdAt)}</em></span>
        </span>
      </span>
    </button>`;
}

function settingsPage(state) {
  const nav = [
    ['appearance', '外观'],
    ['repo', 'Git 仓库'],
    ['tags', '标签种类'],
  ];
  return `
    <div class="page settings-page">
      <header class="page-head">
        <div>
          <h1>全局设置</h1>
          <p>外观、仓库，以及所有项目都能用的标签种类。某个项目用哪几个标签，去顶部的项目设置。</p>
        </div>
      </header>
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="设置章节">
          ${nav.map(([id, label]) => `<button type="button" class="nav-item ${state.ui.settingsAnchor === id ? 'active' : ''}" data-act="settings-jump" data-id="${id}">${label}</button>`).join('')}
        </nav>
        <div class="settings-body">
      <section class="panel" id="sec-appearance">
        <div class="panel-h"><h3>外观</h3></div>
        <div class="opt">
          <span>主题</span>
          <div class="seg theme-pair" aria-label="主题">
            <button type="button" class="${state.settings.theme === 'dark' ? 'on' : ''}" data-act="theme" data-id="dark">${icon('moon', 14)} 深色</button>
            <button type="button" class="${state.settings.theme === 'light' ? 'on' : ''}" data-act="theme" data-id="light">${icon('sun', 14)} 浅色</button>
            <button type="button" class="${state.settings.theme === 'teal' ? 'on' : ''}" data-act="theme" data-id="teal">${icon('sun', 14)} 青绿</button>
          </div>
        </div>
      </section>
      ${repoSection(state)}
      <div id="sec-tags">
        ${tagDomain(state, 'project', '项目标签种类', '这里只定义种类和可选内容。具体项目选哪一项，在项目设置里，会显示在左侧项目行右边。')}
        ${tagDomain(state, 'idea', '想法标签种类', '想法列表上的标签种类。和项目标签互不影响。')}
      </div>
      <section class="panel" id="sec-reset">
        <div class="panel-h"><h3>示例数据</h3></div>
        <div class="opt">
          <span>重置</span>
          <div>
            <p class="hint">清掉这台浏览器里改过的内容，回到星港余烬和纸船。</p>
            <button type="button" class="btn danger" data-act="reset-ask">重置示例数据</button>
          </div>
        </div>
      </section>
        </div>
      </div>
    </div>`;
}

function projectSettingsPage(state, project) {
  return `
    <div class="page settings-page project-settings">
      <header class="page-head">
        <div>
          <h1>项目设置</h1>
          <p>只属于「${esc(project.name)}」。这里改标签、模块、版本、里程碑和笔记。</p>
        </div>
      </header>
      ${projectSettings(state, project)}
    </div>`;
}

function repoSection(state) {
  const g = state.settings.github;
  const logged = isLoggedIn();
  return `
    <section class="panel" id="sec-repo">
      <div class="panel-h"><h3>Git 仓库</h3><span class="pill ${logged ? 'ok' : ''}">${logged ? `已登录 ${esc(g.username)}` : '未登录'}</span></div>
      <p class="hint">只提交项目数据，例如任务、Bug、想法、里程碑和回收站。这个软件本身不会进仓库。原型不会真的连接 GitHub，登录状态记在这台浏览器里。</p>
      <div class="form-grid">
        <label class="stack">仓库地址
          <input data-input="github-url" value="${esc(g.url)}" placeholder="https://github.com/你的名字/仓库" />
        </label>
        <label class="stack">分支
          <input data-input="github-branch" value="${esc(g.branch)}" />
        </label>
        <label class="stack">用户名
          <input data-input="github-user" value="${esc(g.username)}" />
        </label>
        <label class="stack">个人访问令牌
          <input data-input="github-token" type="password" value="${esc(g.token)}" placeholder="原型里随便填一串即可" />
        </label>
      </div>
      <label class="checkline">
        <input type="checkbox" data-change="github-remember" ${g.remembered ? 'checked' : ''} />
        <span>登录后记住这个仓库</span>
      </label>
      <div class="row-actions">
        <button type="button" class="btn primary" data-act="save-github">保存并登录</button>
        <button type="button" class="btn" data-act="logout" ${logged ? '' : 'disabled'}>退出登录</button>
      </div>
      ${g.remembered && g.url ? `<p class="hint">已记住仓库 ${esc(g.url)}。</p>` : ''}
    </section>`;
}

function tagDomain(state, domain, title, blurb) {
  const list = kinds(domain);
  return `
    <section class="panel" id="sec-${domain === 'project' ? 'project-tags' : 'idea-tags'}">
      <div class="panel-h">
        <h3>${title}</h3>
        <div class="stepper" aria-label="标签数量">
          <button type="button" data-act="kind-count" data-domain="${domain}" data-dir="-1" aria-label="减少标签种类">−</button>
          <span>${list.length}</span>
          <button type="button" data-act="kind-count" data-domain="${domain}" data-dir="1" aria-label="增加标签种类">+</button>
        </div>
      </div>
      <p class="hint">${blurb} 上面的数字就是槽位数量。</p>
      ${list.length ? list.map((kind, index) => kindCard(state, kind, index, domain)).join('') : '<p class="empty">还没有标签种类。把数量调高就会出现槽位。</p>'}
    </section>`;
}

function kindCard(state, kind, index, domain) {
  return `
    <article class="kind-card">
      <div class="kind-top">
        <span class="slot-no">槽位 ${index + 1}</span>
        <button type="button" class="btn tiny danger" data-act="delete-kind" data-id="${kind.id}">删除种类</button>
      </div>
      <div class="form-grid">
        <label class="stack">标签种类
          <input data-input="kind-name" data-id="${kind.id}" value="${esc(kind.name)}" />
        </label>
        <label class="stack">背景色
          <input type="color" data-change="kind-color" data-id="${kind.id}" value="${safeColor(kind.color)}" />
        </label>
      </div>
      ${domain === 'project' ? `
        <label class="stack">显示在项目名右边
          <select data-change="kind-slot" data-id="${kind.id}">
            <option value="0" ${kind.slot === 0 ? 'selected' : ''}>不显示</option>
            <option value="1" ${kind.slot === 1 ? 'selected' : ''}>第 1 个</option>
            <option value="2" ${kind.slot === 2 ? 'selected' : ''}>第 2 个</option>
            <option value="3" ${kind.slot === 3 ? 'selected' : ''}>第 3 个</option>
          </select>
        </label>
        <p class="hint">从左往右最多三个。同一个位置只会留给一个种类。</p>
      ` : ''}
      ${kind.bindVersions ? '<p class="hint">这是版本种类。项目里新建版本后，会自动加上最新版本号，并更新到该项目名称旁边。</p>' : ''}
      <div class="child-h"><h4>标签内容</h4>${addButton('添加内容', `data-act="add-value" data-id="${kind.id}"`)}</div>
      ${kind.values.length ? kind.values.map((value) => `
        <div class="value-row">
          <i class="chip" style="--chip:${safeColor(kind.color)}">${esc(value.name || '未命名')}</i>
          <input data-input="value-name" data-kind="${kind.id}" data-id="${value.id}" value="${esc(value.name)}" aria-label="标签内容" />
          ${value.projectId ? `<span class="muted">${esc(findName(state, value.projectId))}</span>` : ''}
          <button type="button" class="icon-btn" data-act="delete-value" data-kind="${kind.id}" data-id="${value.id}" aria-label="删除标签内容">${icon('close', 14)}</button>
        </div>`).join('') : '<p class="empty tight">这个种类还没有内容。</p>'}
    </article>`;
}

function findName(state, id) {
  return state.projects.find((p) => p.id === id)?.name || '已删除的项目';
}

function projectSettings(state, project) {
  return `
    <section class="panel" id="sec-project">
      <div class="panel-h"><h3>项目信息</h3></div>
      <div class="form-grid">
        <label class="stack">名称
          <input data-input="project-name" value="${esc(project.name)}" />
        </label>
        <label class="stack">简介
          <input data-input="project-desc" value="${esc(project.description)}" />
        </label>
      </div>
      <div class="form-grid">
        ${kinds('project').map((kind) => `
          <label class="stack">${esc(kind.name)}
            <select data-change="project-tag" data-kind="${kind.id}">
              <option value="">未选</option>
              ${kind.values.filter((v) => !v.projectId || v.projectId === project.id).map((v) => `
                <option value="${v.id}" ${project.tags?.[kind.id] === v.id ? 'selected' : ''}>${esc(v.name)}</option>
              `).join('')}
            </select>
          </label>`).join('')}
      </div>
      ${kinds('project').some((k) => k.bindVersions) ? '<p class="hint">新建版本时，版本标签会自动改成最新版本。</p>' : ''}
    </section>
    <section class="panel" id="sec-modules">
      <div class="panel-h"><h3>模块</h3></div>
      <p class="hint">模块属于项目，会长期留着。版本只是筛选任务的方式。</p>
      ${project.modules.length ? project.modules.map((mod) => `
        <div class="value-row">
          <input data-input="module-name" data-id="${mod.id}" value="${esc(mod.name)}" aria-label="模块名称" />
          <button type="button" class="btn tiny danger" data-act="delete-module" data-id="${mod.id}">删除</button>
        </div>`).join('') : '<p class="empty">还没有模块。</p>'}
      <div class="row-actions">
        <input id="new-module-name" data-input="new-module" value="${esc(state.ui.newModule || '')}" placeholder="例如 战斗系统" aria-label="新模块名称" />
        ${addButton('添加模块', 'data-act="add-module"')}
      </div>
    </section>
    <section class="panel" id="sec-versions">
      <div class="panel-h"><h3>版本</h3></div>
      <p class="hint">任务只挂在版本上。里程碑和版本平级，不会变成版本的子级。</p>
      ${project.versions.map((v) => `
        <div class="value-row">
          <input data-input="version-name" data-id="${v.id}" value="${esc(v.name)}" aria-label="版本号" />
          <input data-input="version-title" data-id="${v.id}" value="${esc(v.title)}" aria-label="版本标题" placeholder="标题" />
          <button type="button" class="btn tiny danger" data-act="delete-version" data-id="${v.id}">删除</button>
        </div>`).join('')}
      <div class="row-actions">
        <input data-input="new-version-name" value="${esc(state.ui.newVersionName || '')}" placeholder="v0.3" aria-label="新版本号" />
        <input data-input="new-version-title" value="${esc(state.ui.newVersionTitle || '')}" placeholder="这一版要做什么" aria-label="新版本标题" />
        ${addButton('添加版本', 'data-act="add-version"')}
      </div>
    </section>
    <section class="panel" id="sec-milestones">
      <div class="panel-h"><h3>里程碑</h3></div>
      <p class="hint">里程碑只在仪表盘上展示，不承载任务。</p>
      ${project.milestones.length ? project.milestones.map((m) => `
        <div class="value-row milestone-row">
          <input data-input="milestone-name" data-id="${m.id}" value="${esc(m.name)}" aria-label="里程碑名称" />
          <select data-change="milestone-version" data-id="${m.id}" aria-label="对应版本">
            ${project.versions.map((v) => `<option value="${v.id}" ${m.versionId === v.id ? 'selected' : ''}>${esc(versionName(project, v.id))}</option>`).join('')}
          </select>
          <select data-change="milestone-status" data-id="${m.id}" aria-label="里程碑状态">
            ${MILESTONE_STATUSES.map((s) => `<option value="${s.id}" ${m.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          <button type="button" class="btn tiny danger" data-act="delete-milestone" data-id="${m.id}">删除</button>
        </div>`).join('') : '<p class="empty">还没有里程碑。</p>'}
      <div class="row-actions end">
        ${addButton('创建里程碑', 'data-act="add-milestone"')}
      </div>
    </section>
    <section class="panel" id="sec-notes">
      <div class="panel-h"><h3>笔记</h3>${addButton('新建笔记', 'data-act="new-note"')}</div>
      <p class="hint">笔记会进全局搜索。适合记手感数字、参考和临时决定。</p>
      ${project.notes.length ? project.notes.map((note) => `
        <button type="button" class="link-row" data-act="edit-note" data-id="${note.id}">
          <span>${esc(note.title)}</span>
          <em>${esc(preview(note.body, 36))}</em>
        </button>`).join('') : '<p class="empty">还没有笔记。</p>'}
    </section>`;
}

function trashPage(state) {
  const labels = {
    project: '项目', task: '任务', bug: 'Bug', idea: '想法', note: '笔记',
    milestone: '里程碑', module: '模块', version: '版本', subtask: '子任务', check: '检查项',
  };
  return `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>回收站</h1>
          <p>删掉的内容先留在这里。可以恢复，也可以彻底删除。彻底删除后，仓库里仍要等你提交，删除才会同步走。</p>
        </div>
      </header>
      ${focalRow([['待处理', state.trash.length], ['可恢复', state.trash.length], ['种类', new Set(state.trash.map((item) => item.kind)).size]])}
      ${state.trash.length ? `
        <div class="trash-table">
          <div class="trash-row head"><span>类型</span><span>名称</span><span>项目</span><span>删除时间</span><span></span></div>
          ${state.trash.map((item) => `
            <div class="trash-row" id="trash-${item.id}">
              <span>${labels[item.kind] || item.kind}</span>
              <span>${esc(item.name)}</span>
              <span>${esc(item.projectName || '—')}</span>
              <span>${fmt(item.deletedAt)}</span>
              <span class="row-actions">
                <button type="button" class="btn tiny" data-act="restore" data-id="${item.id}">恢复</button>
                <button type="button" class="btn tiny danger" data-act="purge" data-id="${item.id}">彻底删除</button>
              </span>
            </div>`).join('')}
        </div>` : `
        <div class="empty-hero slim">
          <h2>回收站是空的</h2>
          <p>删掉的项目、任务、Bug、想法、笔记和里程碑会先出现在这里。</p>
        </div>`}
    </div>`;
}

function scmPanel(state) {
  const changes = gitChanges();
  const staged = changes.filter((c) => c.staged && !c.remote);
  const local = changes.filter((c) => !c.staged && !c.remote);
  const remote = changes.filter((c) => c.remote);
  const tools = [
    ['commit-push', '提交并推送', 'checkUp'],
    ['commit', '提交', 'check'],
    ['stage-all', '全部暂存', 'plus'],
    ['unstage-all', '取消暂存', 'minus'],
    ['push', '推送', 'upload'],
    ['pull', '拉取', 'download'],
    ['refresh', '刷新', 'refresh'],
  ];
  const selected = changes.find((c) => c.path === state.ui.scmSelected);
  return `
    <aside class="scm">
      <div class="clip-scm">
      <div class="scm-h">
        <span>源代码管理</span>
        <em>${changes.length || ''}</em>
      </div>
      <div class="scm-tools">
        ${tools.map(([id, label, name]) => `<button type="button" class="icon-btn" data-act="scm-tool" data-id="${id}" title="${label}" aria-label="${label}">${icon(name, 16)}</button>`).join('')}
      </div>
      <textarea class="commit-box" data-input="commit" data-field="commit" rows="3" placeholder="提交信息（Ctrl+Enter 提交）">${esc(state.git.commitMessage || '')}</textarea>
      <div class="scm-scroll">
        ${sectionFiles('暂存的更改', staged, true)}
        ${sectionFiles('更改', local, false)}
        ${sectionFiles('可拉取', remote, false)}
        ${changes.length ? '' : '<p class="empty">工作区是干净的。改任务、想法或里程碑后，对应的项目文件会出现在这里。</p>'}
        ${selected ? `<div class="scm-detail"><strong>${esc(fileLabel(selected.path).name)}</strong><p>${esc(selected.summary)}</p><p class="hint">提交范围只有项目文件，不含这个软件本身。</p></div>` : ''}
        ${state.git.commits[0] ? `<p class="hint last-commit">最近提交：${esc(state.git.commits[0].message)}</p>` : ''}
      </div>
      </div>
    </aside>`;
}

function sectionFiles(title, list, staged) {
  if (!list.length) return '';
  return `
    <div class="scm-sec">
      <div class="scm-sec-h">${title}<span>${list.length}</span></div>
      ${list.map((file) => fileRow(file, staged)).join('')}
    </div>`;
}

function fileRow(file, staged) {
  const label = fileLabel(file.path);
  const action = file.remote
    ? ''
    : `<button type="button" class="icon-btn" data-act="${staged ? 'unstage-file' : 'stage-file'}" data-path="${esc(file.path)}" title="${staged ? '取消暂存' : '暂存'}">${icon(staged ? 'minus' : 'plus', 14)}</button>`;
  return `
    <div class="file-row ${file.kind}">
      <button type="button" class="file-main" data-act="pick-file" data-path="${esc(file.path)}">
        <span class="file-name">${esc(label.name)}</span>
        <span class="file-dir">${esc(label.dir)}</span>
      </button>
      ${action}
      <span class="mark mark-${file.kind}" title="${file.kind === 'P' ? '拉取' : file.kind === 'M' ? '修改' : file.kind === 'A' ? '新增' : '删除'}">${file.kind}</span>
    </div>`;
}

function statusbar(state, project) {
  const g = state.settings.github;
  return `
    <footer class="statusbar">
      <span class="sb-left">${project ? esc(project.name) : '未打开项目'}</span>
      <button type="button" class="sb-git" data-act="scm-open">
        ${icon('git', 14)}
        <span>${esc(g.branch || state.git.branch || 'main')}</span>
        <span class="ahead">↑${state.git.ahead || 0}</span>
        <span class="behind">↓${state.git.behind || 0}</span>
      </button>
    </footer>`;
}

function modal(state, project) {
  const m = state.modal;
  let body = '';
  if (m.type === 'confirm') {
    body = `
      <h2>${esc(m.title)}</h2>
      <p>${esc(m.body)}</p>
      <div class="row-actions end">
        <button type="button" class="btn" data-act="close-modal">取消</button>
        <button type="button" class="btn danger" data-act="confirm-ok">${esc(m.confirm || '确定')}</button>
      </div>`;
  } else if (m.type === 'project') body = projectModal(state);
  else if (m.type === 'idea') body = ideaModal(state, project);
  else if (m.type === 'convert') body = convertModal(state, project);
  else if (m.type === 'task') body = taskModal(state, project);
  else if (m.type === 'note') body = noteModal(state);
  else if (m.type === 'bug') body = bugModal(state, project);
  return `<div class="modal-back" data-act="close-modal"><div class="dialog" data-act="stop" role="dialog">${body}</div></div>`;
}

function projectModal(state) {
  const m = state.modal;
  const typeKind = state.tagKinds.find((k) => k.id === 'k_type');
  const platformKind = state.tagKinds.find((k) => k.id === 'k_platform');
  const options = (kind, current) => (kind?.values || []).filter((v) => !v.projectId).map((v) => `<option value="${v.id}" ${current === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  return `
    <h2>新建项目</h2>
    <label class="stack">名称<input data-input="modal" data-key="name" data-field="modal-name" value="${esc(m.name || '')}" /></label>
    <label class="stack">简介<textarea data-input="modal" data-key="description" rows="2">${esc(m.description || '')}</textarea></label>
    <div class="form-grid">
      <label class="stack">类型<select data-change="modal-type">${options(typeKind, m.typeId)}</select></label>
      <label class="stack">平台<select data-change="modal-platform">${options(platformKind, m.platformId)}</select></label>
    </div>
    <div class="form-grid">
      <label class="stack">初始版本<input data-input="modal" data-key="versionName" value="${esc(m.versionName || '')}" /></label>
      <label class="stack">版本标题<input data-input="modal" data-key="versionTitle" value="${esc(m.versionTitle || '')}" /></label>
    </div>
    <label class="stack">初始模块，一行一个<textarea data-input="modal" data-key="modulesText" rows="4">${esc(m.modulesText || '')}</textarea></label>
    <div class="row-actions end">
      <button type="button" class="btn" data-act="close-modal">取消</button>
      <button type="button" class="btn primary" data-act="create-project">创建</button>
    </div>`;
}

function ideaModal(state, project) {
  const m = state.modal;
  const converted = m.status === 'converted';
  return `
    <div class="sheet-flat">
      <div class="panel-h"><h2>${m.isNew ? '新想法' : '想法'}</h2>${converted ? '<span class="stamp static">已转任务</span>' : '<span class="pill">收集中</span>'}</div>
      <label class="stack">标题<input data-input="modal" data-key="title" data-field="modal-title" value="${esc(m.title || '')}" /></label>
      <label class="stack">内容<textarea data-input="modal" data-key="body" data-field="modal-body" rows="6">${esc(m.body || '')}</textarea></label>
      ${kinds('idea').map((kind) => `
        <fieldset>
          <legend>${esc(kind.name)}</legend>
          ${kind.values.map((value) => `
            <label class="checkline">
              <input type="checkbox" data-change="idea-tag" data-id="${value.id}" ${(m.tagIds || []).includes(value.id) ? 'checked' : ''} />
              <span class="chip" style="--chip:${safeColor(kind.color)}">${esc(value.name)}</span>
            </label>`).join('') || '<p class="empty tight">这个种类还没有内容。</p>'}
        </fieldset>`).join('')}
      <div class="row-actions end">
        ${m.isNew ? '' : '<button type="button" class="btn danger" data-act="delete-idea">删除</button>'}
        ${!m.isNew && !converted && project ? '<button type="button" class="btn" data-act="open-convert">转为任务</button>' : ''}
        ${converted && m.taskId ? `<button type="button" class="btn" data-act="open-task" data-id="${m.taskId}">查看任务</button>` : ''}
        <button type="button" class="btn" data-act="close-modal">关闭</button>
        <button type="button" class="btn primary" data-act="save-idea">保存</button>
      </div>
    </div>`;
}

function convertModal(state, project) {
  const m = state.modal;
  if (!project) return '<p>先选择项目。</p>';
  return `
    <h2>转为任务</h2>
    <p class="hint">「${esc(m.title || '')}」会变成一条代办。想法会标成已转任务。</p>
    <label class="stack">放进哪个版本
      <select data-change="convert-version">
        ${project.versions.map((v) => `<option value="${v.id}" ${m.versionId === v.id ? 'selected' : ''}>${esc(versionName(project, v.id))}</option>`).join('')}
      </select>
    </label>
    <label class="stack">放进哪个模块
      <select data-change="convert-module">
        ${project.modules.map((mod) => `<option value="${mod.id}" ${m.moduleId === mod.id ? 'selected' : ''}>${esc(mod.name)}</option>`).join('')}
      </select>
    </label>
    <div class="row-actions end">
      <button type="button" class="btn" data-act="close-modal">取消</button>
      <button type="button" class="btn primary" data-act="do-convert">转换</button>
    </div>`;
}

function taskModal(state, project) {
  const m = state.modal;
  if (!project) return '<p>先选择项目。</p>';
  return `
    <h2>新建任务</h2>
    <label class="stack">标题<input data-input="modal" data-key="title" data-field="modal-title" value="${esc(m.title || '')}" /></label>
    <label class="stack">描述<textarea data-input="modal" data-key="description" rows="3">${esc(m.description || '')}</textarea></label>
    <label class="stack">版本
      <select data-change="task-draft-version">
        ${project.versions.map((v) => `<option value="${v.id}" ${m.versionId === v.id ? 'selected' : ''}>${esc(versionName(project, v.id))}</option>`).join('')}
      </select>
    </label>
    <label class="stack">模块
      <select data-change="task-draft-module">
        ${project.modules.map((mod) => `<option value="${mod.id}" ${m.moduleId === mod.id ? 'selected' : ''}>${esc(mod.name)}</option>`).join('')}
      </select>
    </label>
    <div class="row-actions end">
      <button type="button" class="btn" data-act="close-modal">取消</button>
      <button type="button" class="btn primary" data-act="create-task">添加</button>
    </div>`;
}

function bugModal(state, project) {
  const m = state.modal;
  if (!project) return '<p>先选择项目。</p>';
  return `
    <h2>新建 Bug</h2>
    <label class="stack">名称<input data-input="modal" data-key="name" data-field="modal-title" value="${esc(m.name || '')}" /></label>
    <label class="stack">简述<textarea data-input="modal" data-key="summary" rows="3">${esc(m.summary || '')}</textarea></label>
    <label class="stack">模块
      <select data-change="bug-draft-module">
        ${project.modules.map((mod) => `<option value="${mod.id}" ${m.moduleId === mod.id ? 'selected' : ''}>${esc(mod.name)}</option>`).join('')}
      </select>
    </label>
    <div class="row-actions end">
      <button type="button" class="btn" data-act="close-modal">取消</button>
      <button type="button" class="btn primary" data-act="create-bug">添加</button>
    </div>`;
}

function noteModal(state) {
  const m = state.modal;
  return `
    <h2>${m.isNew ? '新建笔记' : '笔记'}</h2>
    <label class="stack">标题<input data-input="modal" data-key="title" data-field="modal-title" value="${esc(m.title || '')}" /></label>
    <label class="stack">正文<textarea data-input="modal" data-key="body" data-field="modal-body" rows="6">${esc(m.body || '')}</textarea></label>
    <div class="row-actions end">
      ${m.isNew ? '' : '<button type="button" class="btn danger" data-act="delete-note">删除</button>'}
      <button type="button" class="btn" data-act="close-modal">关闭</button>
      <button type="button" class="btn primary" data-act="save-note">保存</button>
    </div>`;
}
