# Persistent Error Capture — gebruiksaanwijzing

Bij een tab-crash op iOS verlies je normaal alle in-memory state, inclusief de error-ringbuffer in `js/core/debug.js`. Deze fix mirrort errors naar `localStorage` zodat ze de crash overleven en bij de volgende boot zichtbaar worden.

## Wat het doet

Elke keer dat `pushErr()` in `core/debug.js` wordt aangeroepen (door `window.error`, `unhandledrejection`, of expliciete `dbg.error()` calls), wordt de entry óók in `localStorage` onder de key `src_persisted_errors` opgeslagen.

- Cap: laatste 30 entries (oudste worden weggegooid bij overflow)
- TTL: 7 dagen — entries ouder dan een week worden bij volgende boot opgeruimd
- Session-id: elke boot krijgt een random ID; bij reload zie je dus welke errors van welke session zijn

## Hoe je errors van een vorige sessie zichtbaar maakt

Drie manieren, kies wat past:

### Op desktop (Mac / iPad met externe keyboard)

```
Ctrl+Shift+E   →   error-viewer popup met alle errors (huidige + persisted)
```

Of in de console:
```js
dbg.persistedErrors()    // alleen entries van vorige sessions
dbg.errors()             // alle entries (current + previous gemixt)
dbg.showErrors()         // open de viewer
dbg.clearErrors()        // wis ringbuffer + localStorage
```

### Op mobile (iPhone / iPad zonder keyboard)

Drie opties om de visible badge te activeren:

**Optie A**: voeg `?showcrash=1` toe aan de URL. Bij reload, als er persisted errors zijn, verschijnt rechtsboven een rode badge: `⚠ N errors from prev session — tap voor details`. Tap = error-viewer opent.

**Optie B**: zet `localStorage.src_show_crash='1'` (eenmalig, blijft staan tot je 'm verwijdert). Daarna verschijnt de badge automatisch bij elke boot wanneer er persisted errors zijn.

**Optie C**: zet `localStorage.src_debug='1'` of voeg `?debug` toe aan URL. Schakelt de hele dbg-laag in (incl. badge + extra logging).

### Via Mac Safari Web Inspector (remote)

iPad via Lightning aan Mac. In Mac Safari: **Develop → [iPad-naam] → [Spencer's Race Club tab]**. In de Inspector-console:

```js
// Bekijk persisted errors
JSON.parse(localStorage.getItem('src_persisted_errors'))

// Of via dbg API (zelfde data, beter geformatteerd)
dbg.persistedErrors()

// Copy alles naar clipboard zodat je het kunt mailen / posten
copy(JSON.stringify(dbg.persistedErrors(), null, 2))
```

## Workflow bij crash-onderzoek

1. **Site crasht op iPad** (tab dood)
2. **Reload de pagina** (pull-to-refresh of nieuwe tab)
3. **Activeer badge**: voeg `?showcrash=1` aan URL toe of zet `localStorage.src_show_crash='1'`
4. **Reload weer**
5. **Tap op de rode badge rechtsboven** → error-viewer opent
6. **Tap "📋 COPY"** in de viewer → alle errors op clipboard
7. **Plak in Slack/Notion/email** — geef door aan dev voor diagnose

## Wat verschijnt in de errors

Format: `[t-seconds] [session-id] [kind] message — extra-json`

Bijvoorbeeld:
```
[12.345s] [k2x9pq-7a3b] [window.error] Uncaught TypeError: Cannot read property 'mesh' of undefined
  → {"src":"js/cars/build.js","line":167,"col":24}
```

- `t-seconds`: seconds-sinds-page-load toen de error fired
- `session-id`: random per-boot identifier — entries van VORIGE boot hebben prefix `(prev)`
- `kind`: error-bron (`window.error`, `unhandledrejection`, `boot`, `scene`, etc.)
- `extra-json`: bron-info (filename, line, col) of context

## Wat NIET wordt gevangen

- Browser-tab kills door OOM zonder JS-error: deze gooien geen JS-error, ze killen de tab abrupt. **Geen entry**. Symptoom is "Kan deze pagina niet openen" zonder error in localStorage.
- WebGL context loss: gevangen door `webglcontextlost` event handler, maar die schrijft naar `dbg.warn` (niet error). Komt niet in persisted-errors. Wel zichtbaar via console.
- Native crashes (graphics driver, etc.): zelfde verhaal — geen JS-error, geen entry.

Voor die categorie crashes is **alleen de Mac-Safari-Web-Inspector** workflow informatief. Ook met de fix.

## Privacy / opslag

- `src_persisted_errors` zit in `localStorage` — zelfde origin-scope als alle andere game-state
- Format is JSON, ~300 bytes per entry, max 30 entries = ~9KB worst-case
- Wordt niet over network gestuurd — alleen lokaal opgeslagen
- Ouder dan 7 dagen wordt automatisch opgeruimd bij volgende boot
- `dbg.clearErrors()` wist alles handmatig

## Test in sandbox

```sh
# Verifieer end-to-end (vereist running localhost http server)
node /tmp/error-capture-test.mjs
```

Output toont:
- Storage entry na een geforceerde error
- Badge verschijnt na reload  
- `dbg.persistedErrors()` retourneert correct count
- `clearErrors()` wist storage volledig
