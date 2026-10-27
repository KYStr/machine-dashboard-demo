/** Small original inline icons. No icon CDN or external font is requested. */
const paths = {
 factory: '<path d="M3 21V10l6-3v5l6-3v12H3Z"/><path d="M15 21h6V5h-4v7M6 16h.01M10 16h.01M18 16h.01M6 19h.01M10 19h.01M18 19h.01M17 3h4"/>',
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 chart:'<path d="M3 3v18h18M6 15l4-5 4 3 6-7"/><path d="M16 6h4v4"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1"/>',
 settings:'<path d="m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1Z" transform="translate(1 0) scale(.91)"/><circle cx="12" cy="12" r="3"/>',
 temperature:'<path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0ZM12 9v9M18 5h2M18 9h2"/>',
 gauge:'<path d="M4 18a9 9 0 1 1 16 0M12 13l4-5M5 12h2M17 12h2M12 4v2M6 6l2 2"/><circle cx="12" cy="14" r="2"/>',
 cube:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7M12 12v10M7 4.8l10 5.5v5"/>',
 warning:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
 pause:'<path d="M9 6v12M15 6v12"/><circle cx="12" cy="12" r="10"/>',
 play:'<path d="m9 5 11 7-11 7V5Z"/>',
 search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
 refresh:'<path d="M20 7a9 9 0 0 0-15-2L2 8M2 2v6h6M4 17a9 9 0 0 0 15 2l3-3M22 22v-6h-6"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.5 1.5m12.6 12.6 1.5 1.5M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5"/>',
 moon:'<path d="M21 12.9A9 9 0 0 1 11.1 3 9 9 0 1 0 21 12.9Z"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 sliders:'<path d="M4 6h4m4 0h8M4 12h10m4 0h2M4 18h2m4 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
 list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 19h2"/>',
 flask:'<path d="M9 3h6M10 3v7L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-10V3M7 15h10"/>',
 external:'<path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7"/>',
 trend:'<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
 clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01"/>'
};
export function icon(name, cls = '') {
 return `<svg class="icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}
export function fillIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
