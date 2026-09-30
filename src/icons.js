const PATHS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  trash: '<path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 12h8l1-12"/><path d="M10 11v5M14 11v5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6"/>',
  sliders: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2.1" fill="currentColor" stroke="none"/><circle cx="10" cy="17" r="2.1" fill="currentColor" stroke="none"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7.5"/>',
  checkUp: '<path d="M4 13l3.2 3.2L14 9"/><path d="M16 6h4v4"/><path d="M20 6l-6 6"/>',
  upload: '<path d="M12 16V6"/><path d="M8 9.5L12 6l4 3.5"/><path d="M5 18h14"/>',
  download: '<path d="M12 6v10"/><path d="M8 12.5L12 16l4-3.5"/><path d="M5 18h14"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2-4.9"/><path d="M19 4.5V9h-4.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronLeft: '<path d="M14 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  git: '<circle cx="7" cy="7" r="2.2"/><circle cx="7" cy="17" r="2.2"/><circle cx="17" cy="12" r="2.2"/><path d="M7 9.2v5.6M9.1 8.2c2.2.8 3.6 2 3.6 3.8"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M16 3.5A8 8 0 1 0 20.5 14 6.5 6.5 0 0 1 16 3.5z"/>',
  note: '<path d="M7 3.5h7l4 4V20H7z"/><path d="M14 3.5V8h4"/><path d="M9 12h6M9 16h4"/>',
  bug: '<path d="M9 9h6v3a3 3 0 0 1-6 0V9z"/><path d="M12 6V4"/><path d="M8 8L6 6M16 8l2-2M7 13H4M20 13h-3M8 17l-2 2M16 17l2 2"/>',
  bulb: '<path d="M9 17h6"/><path d="M10 20h4"/><path d="M8.5 14a5 5 0 1 1 7 0c-.8.7-1.5 1.4-1.5 2.5h-4c0-1.1-.7-1.8-1.5-2.5z"/>',
};

export function icon(name, size = 18) {
  const body = PATHS[name] || PATHS.note;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
