import { bind } from './actions.js';
import { render } from './render.js';
import { init, state } from './store.js';

init();

let layout = 'wide';
let shownPage = '';

function layoutMode() {
  const width = window.innerWidth;
  if (width < 860) return 'compact';
  if (width < 1180) return 'medium';
  return 'wide';
}

function paint(options = {}) {
  const pending = state.ui.pendingScroll;
  const prevShell = document.querySelector('.shell');
  const prev = prevShell ? {
    side: prevShell.classList.contains('side-open'),
    scm: prevShell.classList.contains('scm-open'),
  } : null;
  const main = document.querySelector('.main');
  const side = document.querySelector('.sidebar-scroll');
  const scm = document.querySelector('.scm-scroll');
  const scrolls = {
    main: main?.scrollTop || 0,
    side: side?.scrollTop || 0,
    scm: scm?.scrollTop || 0,
  };
  document.documentElement.dataset.theme = state.settings.theme || 'dark';
  document.getElementById('app').innerHTML = render(state, layout);
  nudgeShell(prev);
  if (pending) {
    state.ui.pendingScroll = '';
    document.getElementById(pending)?.scrollIntoView({ block: 'start', inline: 'nearest' });
  } else {
    const nextMain = document.querySelector('.main');
    const nextSide = document.querySelector('.sidebar-scroll');
    const nextScm = document.querySelector('.scm-scroll');
    if (nextMain) nextMain.scrollTop = scrolls.main;
    if (nextSide) nextSide.scrollTop = scrolls.side;
    if (nextScm) nextScm.scrollTop = scrolls.scm;
  }
  const pageKey = `${state.ui.projectId || ''}:${state.ui.activity}:${state.ui.tab}:${state.ui.projectSettings ? 'ps' : ''}`;
  const arriving = shownPage !== pageKey;
  shownPage = pageKey;
  if (arriving) animateHero();
  else {
    document.querySelector('.main')?.classList.add('settled');
    document.querySelector('.float-body')?.classList.add('settled');
  }
  playMotion();
  if (state.ui.ideaMotion) state.ui.ideaMotion = '';
  if (state.ui.layerEnter) state.ui.layerEnter = false;
  if (state.ui.pendingFocus) {
    const field = state.ui.pendingFocus;
    state.ui.pendingFocus = '';
    const node = document.querySelector(`[data-field="${CSS.escape(field)}"]`);
    if (node) {
      node.focus();
      node.select?.();
    }
  }
  if (options.keepFocus && options.focus?.field) {
    const el = document.querySelector(`[data-field="${CSS.escape(options.focus.field)}"]`);
    if (el) {
      el.focus();
      if (typeof options.focus.start === 'number' && el.setSelectionRange) {
        try {
          el.setSelectionRange(options.focus.start, options.focus.end);
        } catch {
          /* datetime inputs reject selection */
        }
      }
    }
  }
}

function nudgeShell(prev) {
  if (!prev) return;
  const shell = document.querySelector('.shell');
  if (!shell) return;
  const compact = shell.classList.contains('layout-compact');
  const overlayScm = compact || shell.classList.contains('layout-medium');
  if (prev.side !== shell.classList.contains('side-open')) {
    const el = shell.querySelector('.sidebar');
    if (compact) replay(el, 'transform', prev.side ? 'translateX(0)' : 'translateX(calc(-100% - 12px))');
    else replay(el, 'width', prev.side ? `${sidebarWidth()}px` : '0px');
  }
  if (prev.scm !== shell.classList.contains('scm-open')) {
    const el = shell.querySelector('.scm');
    if (overlayScm) replay(el, 'transform', prev.scm ? 'translateX(0)' : 'translateX(110%)');
    else replay(el, 'width', prev.scm ? '332px' : '0px');
  }
}

function replay(el, prop, from) {
  if (!el) return;
  el.style.transition = 'none';
  el.style.setProperty(prop, from);
  void el.offsetWidth;
  el.style.transition = '';
  el.style.removeProperty(prop);
}

function sidebarWidth() {
  const width = Number(state.ui.sidebarWidth) || 268;
  return Math.min(480, Math.max(200, width));
}

function playMotion() {
  const motion = state.ui.motion;
  state.ui.motion = null;
  if (!motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (motion.kind === 'fold') {
    kickOpen(document.querySelector(`#task-${CSS.escape(motion.id)} .task-fold`));
    return;
  }
  if (motion.kind === 'desc') {
    const id = CSS.escape(motion.id);
    kickOpen(document.querySelector(`textarea.child-desc[data-id="${id}"]`)?.closest('.desc-fold'));
    kickTriangle(document.querySelector(`.fold-tri[data-id="${id}"]`));
  }
}

function kickOpen(el) {
  if (!el) return;
  const open = el.classList.contains('open');
  el.style.transition = 'none';
  el.classList.toggle('open', !open);
  void el.offsetHeight;
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.style.transition = '';
    el.classList.toggle('open', open);
  });
}

function kickTriangle(tri) {
  if (!tri) return;
  const mark = tri.querySelector('i');
  if (!mark) return;
  const opening = tri.classList.contains('open');
  mark.style.transition = 'none';
  mark.style.transform = opening ? 'rotate(0deg)' : 'rotate(-90deg)';
  void mark.offsetHeight;
  requestAnimationFrame(() => {
    if (!mark.isConnected) return;
    mark.style.transition = '';
    mark.style.transform = '';
  });
}

function animateHero() {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const start = performance.now();
    const dur = 680;
    const tick = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  });
}

bind(paint);
layout = layoutMode();
if (layout === 'compact') state.ui.sidebarOpen = false;
paint();

window.addEventListener('resize', () => {
  const next = layoutMode();
  if (next === layout) return;
  if (next === 'compact') {
    state.ui.sidebarOpen = false;
    state.ui.scmOpen = false;
  }
  layout = next;
  paint();
});
