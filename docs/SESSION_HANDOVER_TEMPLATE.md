# SESSION_HANDOVER_TEMPLATE.md

> Canonical template for end-of-session handover blocks. Fill in the
> twelve sections (A-L) and emit the result as a single mobile-friendly
> markdown code block at the end of every session.
>
> Cross-reference: [`PATTERNS.md`](PATTERNS.md) P7 for the protocol;
> [`DECISIONS.md`](DECISIONS.md) D10 for why this exists.

Last updated: 2026-05-06

---

## When to use

At the end of every session, regardless of size. Even a single-line
fix gets a (compact) handover so the chat side has the context it
needs for the next planning step.

## Format constraints

- **One outer markdown code fence**, so mobile select-all captures
  the whole block in one tap-and-hold gesture
- **No nested triple-backtick fences** inside the outer fence —
  use tildes `~~~` for any inner code blocks
- **Header**: `===== SESSION HANDOVER — KOPIEER DIT NAAR CLAUDE CHAT =====`
- **Footer**: `===== EINDE HANDOVER =====`
- **Bullets**: `-` not `*` (consistent across the codebase)
- **No tabs**: spaces only
- **Long paths on one line**: don't soft-wrap file paths; mobile
  copy-paste preserves them
- **Keep section letters A-L**: the chat side parses them positionally

## Sections (A-L)

### A. Sessie identification

- Sessie name + sequence (e.g. "Pier 47 Cinematic foundation —
  sessie 1 of 3-4")
- Date (yyyy-mm-dd)
- World(s) touched (or "n/a" for infrastructure sessions)
- Number of commits + short hashes (first 7 chars)

### B. What was built

One bullet per commit with a one-line summary. Not a full diff —
just the headline. The chat side reads commit messages for detail.

### C. New helpers / files

- New files (path + one-line purpose)
- New exports (helper signature + one-line purpose)
- Mark each as **reusable** (config-driven, theme-agnostic) or
  **world-specific** (hardcoded to this session's world)

### D. Architecture state

- Naming conventions chosen this session
- Where shared helpers live
- Patterns locked (config-driven defaults, state registry,
  mobile guards inside helpers, etc.)

### E. Autonomous decisions

For each significant autonomous decision: what, why, reversible
or not. Examples:

- "Chose sprite-based cones over shader-based — mobile budget +
  simpler dispose. Reversible: one helper to swap."
- "Removed legacy lamp builder wholesale rather than keeping as
  fallback — clean supersession. Reversible via git revert."

### F. What works well

- Visual wins (effects that landed)
- Technical wins (architecture that's paying off)
- Process wins (rhythm that worked)

### G. What is complex or suboptimal

Honest debt list. Things that work but aren't pretty. Workarounds
applied. Limitations encountered.

### H. Skipped items

What was in the prompt but **deliberately not done**, with reason.
Mark each as "should re-do" / "wait for owner decision" / "obsolete".

### I. Recommendations for next session

Priority-ranked. Each item: what / why / effort tag (S / M / L).

```
1. (M) Convert next world to -cinematic — validates foundation
2. (S) Tune lamp pool radius after live test
3. (L) Real radial motion-blur in postfx
```

### J. Recommendations for the broader collection

For multi-session arcs: how this session feeds the next phase.
Risks identified. Helper extensions worth considering.

### K. Codebase observations

- Patterns spotted that may deserve refactor
- Stale code or dead code spotted (out of scope to fix this
  session)
- Quick wins not picked up

### L. Open vragen voor eigenaar

Questions that genuinely require a human decision before the next
session. Maximum three; if there are more, pick the top three.

## Skeleton

Copy this skeleton into the outer code block at end-of-session,
fill in the placeholders, then emit:

~~~
===== SESSION HANDOVER — KOPIEER DIT NAAR CLAUDE CHAT =====

SESSIE: <name> (<sessie X of Y>)
DATUM: <yyyy-mm-dd>
WERELDEN: <world keys>
COMMITS: <N> stuks
- <hash> <commit message subject>
- <hash> <commit message subject>
...

WAT IS GEBOUWD:
- <commit 1 one-liner>
- <commit 2 one-liner>
...

NIEUWE HELPERS / FILES:
- <path> — <purpose>
- <function signature> — <purpose>
- ...
Reusability tags: reusable | world-specific

ARCHITECTURE STATE:
- Naming convention: <...>
- Shared helpers location: <...>
- Patterns locked: <...>

AUTONOME KEUZES:
- <decision 1>: <what, why, reversible or not>
- <decision 2>: <...>
...

WAT WERKT GOED:
- <visual win>
- <technical win>
- <process win>

WAT IS COMPLEX OF SUBOPTIMAAL:
- <complexity 1>
- <complexity 2>
...

SKIPPED ITEMS:
- <item>: <reason> — <should re-do | wait for owner | obsolete>
- ...

AANBEVELINGEN VOLGENDE SESSIE:
1. (S|M|L) <action> — <reason>
2. ...
3. ...

AANBEVELINGEN VOOR DE GROTERE COLLECTIE:
- <how this feeds the next phase>
- <risks identified>
- <helper extensions worth considering>

CODEBASE OBSERVATIES:
- <observation 1>
- <observation 2>
...

OPEN VRAGEN VOOR JUR:
1. <question 1>
2. <question 2>
3. <question 3>

===== EINDE HANDOVER =====
~~~

## Notes on length

- A small session (single-line fix, one commit) can compress sections
  E, F, G, H, I, J, K to one bullet each or "n/a".
- A foundation session (six-plus commits, new files, new patterns)
  uses every section in full.
- Section L (open questions) is **always present**. If there are
  no open questions, write "None — proceed at owner's discretion."
- Section A is **always present**. Sessie identification anchors the
  rest of the block.

## Why this template exists

See [`DECISIONS.md`](DECISIONS.md) D10. The short version: continuity
between Claude Code sessions and Claude chat is expensive without a
canonical structured output. The handover bridges that gap.
