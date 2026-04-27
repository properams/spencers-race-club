// js/ui/help.js — keybinding-cheatsheet overlay (? of /-shortcut).
// Non-module script.
//
// Overlay toont alle keyboard-shortcuts gegroepeerd per categorie.
// Toggle: Shift+/ (= ?), of '/' alleen, of Escape om te sluiten.
// Sluiten kan ook door erbuiten te klikken.
//
// Keys-tabel hieronder is de single source of truth — als je een nieuwe
// shortcut in ui/input.js toevoegt, voeg 'm hier ook toe.

'use strict';

const HELP_BINDINGS = [
  { group: 'Rijden', keys: [
    ['↑ / W',          'Gas geven'],
    ['↓ / S',          'Remmen / achteruit'],
    ['← → / A D',      'Sturen'],
    ['Space',          'Handrem (drift) — of pauze buiten race'],
    ['N',              'Nitro'],
    ['H',              'Pit-stop (alleen op start/finish-rechte)'],
  ]},
  { group: 'Camera', keys: [
    ['C',              'Wissel camera-view (chase / heli / hood / bumper)'],
    ['V',              'Achteruitkijkspiegel aan/uit'],
  ]},
  { group: 'Game', keys: [
    ['P / Esc',        'Pauze tijdens race'],
    ['M',              'Geluid aan/uit'],
    ['Enter',          'Vanaf titel-scherm: doorgaan'],
  ]},
  { group: 'Debug', keys: [
    ['?  /  /',        'Deze help-overlay'],
    ['Ctrl+Shift+E',   'Error-viewer (laatste 50 errors)'],
    ['Ctrl+Shift+P',   'Performance-overlay (FPS / memory / scene-stats)'],
    ['F3',             'FPS-teller in HUD aan/uit'],
  ]},
];

let _helpEl = null;

function _buildHelpOverlay(){
  const ov = document.createElement('div');
  ov.id = 'helpOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(5,8,18,.92);z-index:99997;display:none;flex-direction:column;align-items:center;justify-content:center;font-family:Orbitron,sans-serif;padding:20px;backdrop-filter:blur(6px)';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:linear-gradient(135deg,#10182a,#1a1030);border:1px solid rgba(180,80,255,.3);border-radius:14px;padding:28px 32px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(180,80,255,.2)';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:14px;color:#cc88ff;letter-spacing:6px;text-align:center;margin-bottom:6px';
  title.textContent = '⌨ KEYBOARD CONTROLS';
  panel.appendChild(title);

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:10px;color:#664488;letter-spacing:3px;text-align:center;margin-bottom:22px';
  sub.textContent = 'Druk Esc, klik buiten of druk ? om te sluiten';
  panel.appendChild(sub);

  for (const grp of HELP_BINDINGS) {
    const gh = document.createElement('div');
    gh.style.cssText = 'font-size:10px;color:#ff8800;letter-spacing:4px;margin:14px 0 8px;border-bottom:1px solid rgba(255,136,0,.2);padding-bottom:4px';
    gh.textContent = grp.group.toUpperCase();
    panel.appendChild(gh);

    for (const [k, label] of grp.keys) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:14px;padding:6px 0;font-family:Rajdhani,sans-serif;font-size:13px;align-items:center';
      const kbd = document.createElement('span');
      kbd.style.cssText = 'flex:0 0 130px;font-family:monospace;font-size:11px;color:#88ddff;background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.2);border-radius:4px;padding:3px 8px;text-align:center;letter-spacing:1px';
      kbd.textContent = k;
      const desc = document.createElement('span');
      desc.style.cssText = 'flex:1;color:#ccd';
      desc.textContent = label;
      row.appendChild(kbd); row.appendChild(desc);
      panel.appendChild(row);
    }
  }

  ov.appendChild(panel);
  // Klik op overlay-achtergrond sluit; klik op panel zelf doet niets.
  ov.addEventListener('click', e => { if (e.target === ov) hideHelp(); });
  document.body.appendChild(ov);
  _helpEl = ov;
  return ov;
}

function showHelp(){
  if (!_helpEl) _buildHelpOverlay();
  _helpEl.style.display = 'flex';
}
function hideHelp(){
  if (_helpEl) _helpEl.style.display = 'none';
}
function toggleHelp(){
  if (_helpEl && _helpEl.style.display === 'flex') hideHelp();
  else showHelp();
}

// Keyboard shortcut: '?' (Shift+/) of '/'-only opent/sluit help.
// Esc sluit de overlay (zonder de pause-overlay te openen).
window.addEventListener('keydown', e => {
  // Negeer als gebruiker in een input typt
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.key === '?' || e.code === 'Slash') {
    e.preventDefault();
    toggleHelp();
    return;
  }
  if (e.code === 'Escape' && _helpEl && _helpEl.style.display === 'flex') {
    e.preventDefault();
    e.stopPropagation();
    hideHelp();
  }
}, true); // capture-phase zodat Escape niet eerst togglePause triggert

window.showHelp = showHelp;
window.hideHelp = hideHelp;
window.toggleHelp = toggleHelp;
