# Raksha — Build Prompts for Antigravity (Gemini 3.1 Pro)

## How to use this file

1. Create a new Antigravity workspace/repo. Drop `ARCHITECTURE.md` and the `data/` folder (`scam_taxonomy.json`, `sample_advisories.json`) into the repo root **before** running Prompt 0 — the agent needs to read them, not invent them.
2. Run the prompts **in order**, one at a time. Each one is scoped to be independently buildable and testable.
3. After each prompt finishes, check it against that prompt's "Acceptance criteria" before moving to the next one. If something's off, ask the agent to fix it in the same prompt's context rather than moving on — later prompts assume earlier ones are correct.
4. Every prompt below already tells the agent to re-read `ARCHITECTURE.md` — this keeps it anchored to the contracts instead of improvising new ones as the build gets long.

---

### Prompt 0 — Project Scaffold

```
Read ARCHITECTURE.md and the two files in data/ fully before doing anything else.

Scaffold a monorepo for "Raksha", a web demo, exactly matching the repository
structure in ARCHITECTURE.md section 3:
- frontend/ — Vite + React + Tailwind CSS
- backend/ — Node.js + Express, ES modules
- data/ — already contains scam_taxonomy.json and sample_advisories.json, leave them as-is

Set up:
- frontend/package.json with React 18, Vite, Tailwind CSS configured
- backend/package.json with express, dotenv, cors, @google/generative-ai, @langchain/langgraph
- backend/.env.example exactly matching ARCHITECTURE.md section 8
- A root README.md with setup instructions: install deps in both folders, copy
  .env.example to .env and add a Gemini API key, run backend on PORT from .env,
  run frontend dev server, open the app
- Empty placeholder files for every path listed in the repository structure
  (components, hooks, services, routes, agent/*, lib/*) so the structure exists
  even before logic is added — each with a one-line comment describing its
  purpose per ARCHITECTURE.md

Do not implement any business logic yet. This prompt is scaffolding only.

Acceptance criteria: `npm install` succeeds in both frontend/ and backend/,
and `npm run dev` in frontend/ shows a blank Vite+React+Tailwind page with no errors.
```

---

### Prompt 1 — Backend Core: Gemini Client, Config, Server Skeleton

```
Read ARCHITECTURE.md sections 4, 5, and 8.

Implement:
- backend/src/config.js — loads and validates env vars from ARCHITECTURE.md
  section 8 (GEMINI_API_KEY, PORT, CLASSIFIER_MODEL, REASONER_MODEL,
  EMBEDDING_MODEL), throws a clear startup error if GEMINI_API_KEY is missing
- backend/src/lib/geminiClient.js — a single shared @google/generative-ai
  client instance, exported for reuse across agent/* modules. Do not let any
  other file instantiate its own client.
- backend/src/server.js — Express app, cors enabled for the frontend's dev
  origin, JSON body parsing, mounts the /api/analyze route (stub it to return
  a hardcoded valid response matching the exact JSON shape in ARCHITECTURE.md
  section 4 for now), starts listening on config.PORT, logs a clear startup
  message including which models are configured

Acceptance criteria: `node backend/src/server.js` starts without errors when
a valid .env is present, and `curl -X POST localhost:4000/api/analyze` with
any JSON body returns a response matching the exact schema in ARCHITECTURE.md
section 4 (riskScore, action, signals[], alertText, retrievedAdvisories).
```

---

### Prompt 2 — Knowledge Retriever (RAG)

```
Read ARCHITECTURE.md sections 5 (Node 2) and 6.

Implement backend/src/agent/retriever.js:
- On module load (server startup), read data/sample_advisories.json, and for
  each entry, compute an embedding of `summary.en + " " + summary.hi` using
  config.EMBEDDING_MODEL via the shared geminiClient. Cache all vectors in
  memory in a module-level array. Log how many advisories were embedded and
  how long it took.
- Export an async function `retrieveAdvisories(transcriptWindow, topK = 3)`
  that embeds the input text, computes cosine similarity against every cached
  vector, and returns the topK advisories sorted by similarity descending, each
  annotated with a `relevance` score (the cosine similarity, rounded to 2
  decimals).
- Do not re-embed the corpus on every request — only at startup.
- Add a small inline comment noting that FAISS is the named upgrade path once
  the corpus grows past a few hundred documents, per ARCHITECTURE.md section 6.

Wire this into backend/src/server.js so embedding happens once at boot before
the server starts accepting requests (log "Knowledge base ready" when done).

Acceptance criteria: write a small ad-hoc test script (or a one-off console.log
in server.js you can remove later) that calls retrieveAdvisories with a sample
Hindi digital-arrest-style sentence and confirms adv-001 ("Digital Arrest
Scams") comes back as the top result.
```

---

### Prompt 3 — Signal Classifier

```
Read ARCHITECTURE.md section 5 (Node 1) and data/scam_taxonomy.json fully.

Implement backend/src/agent/classifier.js:
- Export an async function `classifySignals(transcriptWindow, lang)`.
- Build a system prompt for config.CLASSIFIER_MODEL that includes the full
  signal taxonomy from data/scam_taxonomy.json (id, label, description,
  example_phrases for the active language) and instructs the model to return
  ONLY signals it actually finds evidence for in the given transcript window —
  it must not hallucinate signals with no supporting phrase.
- Use the Gemini API's structured/JSON output mode (response schema or
  controlled generation — check current @google/generative-ai docs for the
  correct method name) to force the output into exactly this shape:
  [{ "id": "authority", "evidencePhrase": "...", "confidence": 0.93 }, ...]
  id must be one of the five taxonomy ids. Do not hand-parse free text.
- If the model returns malformed output, retry once, then fall back to an
  empty array rather than throwing — classification failures must never crash
  the request.

Acceptance criteria: write a quick manual test calling classifySignals with
"मैं सीबीआई से बोल रहा हूं, अभी पैसे ट्रांसफर करें या आपको गिरफ्तार किया जाएगा"
(lang="hi") and confirm it returns authority, payment, and threat signals with
the correct evidence phrases, and confidence scores between 0 and 1.
```

---

### Prompt 4 — LLM Reasoner

```
Read ARCHITECTURE.md section 5 (Node 3).

Implement backend/src/agent/reasoner.js:
- Export an async function `reasonAboutCall({ transcriptWindow, lang, signals, advisories })`.
- Call config.REASONER_MODEL with a prompt that:
  (a) shows the full transcript window,
  (b) shows the signals the classifier already found (with evidence phrases),
  (c) shows the retrieved advisories,
  (d) asks the model to return a REFINED signals array — it may remove a
      signal if full context shows it's clearly benign (e.g. "warrant" used
      while describing a movie plot, not a real threat), but must not add
      brand-new signal types beyond the five in the taxonomy,
  (e) asks it to draft alertText as a bilingual object { en, hi }, in the
      direct, plain-language, panic-proof style shown in ARCHITECTURE.md
      section 7 ("Real police never demand money by phone. Hang up and call
      1930."), grounded in whichever retrieved advisory is most relevant.
- Use structured JSON output again: { "signals": [...], "alertText": {"en":"...", "hi":"..."} }
- On failure, fall back to passing the classifier's original signals through
  unchanged and a generic bilingual alertText constant you define in this file.

Acceptance criteria: feed it the same Hindi example from Prompt 3's test plus
the matching adv-001 advisory, and confirm alertText.hi reads naturally in
Hindi and references hanging up / 1930, and alertText.en is a faithful
(not literal word-for-word) English equivalent.
```

---

### Prompt 5 — Deterministic Risk Scorer

```
Read ARCHITECTURE.md section 5 (Node 4) and data/scam_taxonomy.json's
"scoring" block fully.

Implement backend/src/agent/riskScorer.js as a PURE function with no network
calls and no Gemini imports:
- Export `scoreRisk(signals, elapsedSeconds)` returning
  { riskScore: number 0-100, action: "monitor"|"warn"|"block" }
- Logic: sum each present signal's weight from scam_taxonomy.json's signals
  array (matched by id). Then evaluate every entry in
  scam_taxonomy.json.scoring.escalation_rules and add its bonus when the
  rule's condition is met — implement each rule's condition as actual code
  (don't try to eval the string descriptions), specifically:
    - authority_plus_payment_60s: both an "authority" and a "payment" signal
      are present AND elapsedSeconds <= 60
    - secrecy_plus_threat: both "secrecy" and "threat" signals present
    - all_five_signals: all 5 distinct signal ids present
  Clamp the total to [0, 100]. Map to action using
  scoring.base_threshold_warn (60) and base_threshold_block (85) from the
  same JSON file — do not hardcode 60/85 directly in riskScorer.js, read them
  from the JSON so a judge or teammate can tune thresholds without touching code.

Also write backend/src/agent/riskScorer.test.js with at least 5 unit tests:
no signals → low score/monitor; single weak signal → still monitor; the
authority+payment+<=60s combo → block; secrecy+threat without payment →
warn-range; all five signals present → block. Use whatever lightweight test
runner is already available (node's built-in test runner is fine, avoid
adding a new heavy dependency just for this).

Acceptance criteria: `node --test backend/src/agent/riskScorer.test.js` (or
equivalent) passes all 5 cases.
```

---

### Prompt 6 — LangGraph Orchestrator + Real `/api/analyze`

```
Read ARCHITECTURE.md section 5 ("Orchestration") and section 4 fully.

Implement backend/src/agent/graph.js using @langchain/langgraph:
- Define a graph state shape: { transcriptWindow, lang, elapsedSeconds,
  signals, advisories, alertText, riskScore, action }
- Node "classify": calls classifySignals, writes `signals`
- Node "retrieve": calls retrieveAdvisories, writes `advisories`
  (classify and retrieve should run as parallel branches off START, both
  feeding into reason — wire this as LangGraph's fan-out/fan-in pattern, not
  a sequential chain, since they don't depend on each other)
- Node "reason": calls reasonAboutCall with the merged state from both
  branches, writes refined `signals` and `alertText`
- Node "score": calls scoreRisk(signals, elapsedSeconds), writes `riskScore`
  and `action`
- Compile the graph: START → {classify, retrieve} → reason → score → END
- Export an async function `runRakshaGraph(input)` that invokes the compiled
  graph and returns the final state

Replace the stubbed /api/analyze in backend/src/routes/analyze.js: validate
the incoming request body matches ARCHITECTURE.md section 4's request shape,
call runRakshaGraph, and return a response matching the exact response shape
(map graph state's `advisories` to `retrievedAdvisories` with just
{id, title, relevance} per advisory, dropping the full summary text to keep
the payload small).

Acceptance criteria: a full POST /api/analyze with a realistic Hindi
digital-arrest transcript and elapsedSeconds: 45 returns action "block" with
a populated signals array and a correct, well-formed alertText — verified end
to end through the actual graph, not the old stub.
```

---

### Prompt 7 — Frontend: Call Simulator + Live Transcript + API Wiring

```
Read ARCHITECTURE.md sections 7 (Frontend Behavior Spec) and 10 (Demo Script).

Implement:
- frontend/src/hooks/useSpeechRecognition.js — wraps the browser
  SpeechRecognition API (continuous: true, interimResults: true), takes a
  `lang` ("hi-IN" | "en-IN"), exposes { transcript, isListening, start, stop }.
  Handle the case where SpeechRecognition isn't supported (show a friendly
  message suggesting Chrome) — do not crash.
- frontend/src/components/LanguageToggle.jsx — hi/en switch
- frontend/src/components/CallSimulator.jsx — two modes:
  (1) Live mic, using useSpeechRecognition
  (2) Scripted demo, with the 3 canned transcripts from ARCHITECTURE.md
      section 10 hardcoded as exported constants (write all 3 transcripts
      out in full, in the correct language, long enough to naturally trigger
      each signal in sequence), played back as simulated streaming text at
      roughly natural speaking pace (e.g. word-by-word on an interval)
  A mode switcher and a Start/Stop control for whichever mode is active.
- frontend/src/components/LiveTranscript.jsx — shows the rolling transcript
  with a "Raksha is listening" indicator
- frontend/src/services/api.js — `analyzeTranscript({ sessionId, lang,
  transcriptWindow, elapsedSeconds })` POSTing to the backend's /api/analyze,
  matching ARCHITECTURE.md section 4 exactly
- Wire App.jsx to: generate a sessionId per simulated call, track elapsed
  seconds since start, debounce calls to analyzeTranscript every 3-5 seconds
  using only the last ~30-45s window of transcript text (not the full
  transcript from the start), and store the latest response in state for
  later prompts to consume (risk meter, alert overlay) — don't build those
  UI pieces yet, just store and console.log the response shape for now.

Acceptance criteria: starting the scripted "digital arrest" demo visibly
streams text into the transcript pane, and the console shows
/api/analyze responses with increasing riskScore over time, ending at
action "block".
```

---

### Prompt 8 — Frontend: Risk Meter + Scam Alert Overlay + TTS

```
Read ARCHITECTURE.md section 7 fully, including the exact overlay layout
description and the mockup in the original pitch deck's "UI Mockup" section
(recreate its spirit — risk %, signal list with evidence, plain-language
warning, three action buttons with Hang Up & Block visually primary).

Implement:
- frontend/src/components/RiskMeter.jsx — horizontal 0-100 gauge,
  green (<60) / amber (60-84) / red (>=85), driven by the latest
  /api/analyze response from App.jsx state
- frontend/src/hooks/useSpeechSynthesis.js — wraps window.speechSynthesis,
  exposes `speak(text, lang)` that picks an appropriate voice/lang code
  (hi-IN or en-IN) if available, no-ops gracefully if synthesis isn't
  supported
- frontend/src/components/ScamAlertOverlay.jsx — full-screen modal, only
  rendered when action is "warn" or "block":
    - "⚠ SCAM ALERT — Risk: {riskScore}%" header
    - list of detected signals with their label and evidencePhrase
    - the bilingual alertText rendered in the active language
    - "Hang Up & Block" button — largest, primary, dismisses the overlay and
      ends the simulated call
    - "Report 1930" button — opens a small stub modal saying clearly "Demo
      only — in production this submits to the 1930 helpline API"
    - "Verify: Call Back Family" button — opens the Safe-Word verify flow
      (build the component now, wire it up fully in the next prompt)
    - on mount, call speak(alertText[lang], lang) once (not on every re-render)
- Wire all three into App.jsx alongside the existing transcript/simulator UI.

Acceptance criteria: running the scripted "digital arrest" demo causes the
risk meter to climb, the alert overlay to appear automatically once action
becomes "warn", a spoken alert to play once in the correct language, and the
overlay to update its signal list if action later becomes "block".
```

---

### Prompt 9 — Family Safe-Word Feature

```
Read ARCHITECTURE.md section 7, "Family Safe-Word" subsection.

Implement frontend/src/components/SafeWordSetup.jsx with two screens:
- Setup: a simple form to set a passphrase, stored only in React state for
  the session (explicitly NOT sent to the backend, NOT persisted — add a
  code comment explaining this mirrors the on-device, family-only nature of
  the real feature)
- Verify (opened from the alert overlay's "Verify: Call Back Family" button):
  a single input where the user enters the passphrase the "caller" gave;
  correct match shows a green "Verified — this matches your family safe-word"
  message; incorrect or empty shows "This does not match. This may not be
  who they claim to be — verify another way before sending any money."

Wire this so it's reachable from anywhere in the app: a settings affordance
to set the safe-word ahead of time, and the existing "Verify: Call Back
Family" button from ScamAlertOverlay opening the Verify screen.

Acceptance criteria: setting a safe-word, then triggering an alert in the
scripted demo and opening Verify, correctly distinguishes a matching vs
non-matching entry.
```

---

### Prompt 10 — Polish, Error Handling, and Final Demo Pass

```
Read ARCHITECTURE.md in full once more, end to end, and review the whole
codebase against it for any drift.

Do the following cleanup pass:
- Tailwind theming pass: consistent color tokens for the three risk states
  across RiskMeter and ScamAlertOverlay, readable contrast, mobile-responsive
  layout (the deck emphasizes this is for elderly/low-literacy users —
  large text, large primary buttons)
- Add a visible, honest "DEMO" badge somewhere in the UI plus a short
  collapsible note (sourced from ARCHITECTURE.md section 11) listing what's
  simulated vs real, so judges see the team understands the gap between this
  build and the production vision rather than overclaiming
- Backend: ensure every agent/* function has try/catch with sensible
  fallbacks (per ARCHITECTURE.md) so a single Gemini API hiccup never crashes
  a live demo
- Run through all 3 demo scripts from ARCHITECTURE.md section 10 end to end
  and fix anything that doesn't behave as specified (especially confirm the
  benign-call script stays at "monitor" the whole time — this is the
  false-positive check and matters as much as the scam scripts)
- Update README.md with final run instructions and a one-paragraph summary
  of what to say while demoing each of the 3 scripts

Acceptance criteria: a cold start (fresh `npm install`, fresh .env with a
real key, `npm run dev` on both frontend and backend) followed by running
all 3 scripted demos produces correct, judge-ready behavior with no console
errors.
```
