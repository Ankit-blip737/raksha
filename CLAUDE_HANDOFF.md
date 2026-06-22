# Raksha — Project Handoff for Enhancement

> **Repo**: https://github.com/kartik-ornate/hackathon-project
> **Last updated**: 2026-06-22
> **Status**: Working demo with known rough edges — ready for polish and feature expansion.

---

## 1. What Is Raksha

Raksha is a **real-time AI-powered scam call detection system** built for an Indian hackathon. It analyzes live phone call transcripts and detects 5 scam signals (urgency, authority impersonation, secrecy, threats, payment/OTP extraction) using a **two-tier agentic AI pipeline**:

- **Tier 1 (Browser-Local)**: A zero-shot BERT classifier (`Xenova/mobilebert-uncased-mnli`) runs entirely in the browser via a Web Worker — no network needed for fast initial classification.
- **Tier 2 (Backend)**: When Tier 1 flags a threat, a WebSocket triggers the backend's Gemini-powered RAG + LLM Reasoner for contextual analysis and bilingual alert generation.

The risk scorer is **deterministic code** (not an LLM) — making the warn/block decision auditable.

---

## 2. Tech Stack

| Layer | Tech | Notes |
|---|---|---|
| **Frontend** | React 18, Vite 5, TailwindCSS 3 | Dark-mode, Framer-style glassmorphism UI |
| **Backend** | Node.js, Express, Socket.IO | WebSocket-based Tier 2 pipeline |
| **AI — Tier 1** | `@xenova/transformers` (MobileBERT) | Runs in browser Web Worker, zero-shot classification |
| **AI — Tier 2** | Google Gemini API (`@google/generative-ai`) | Classifier: `gemini-2.5-flash`, Reasoner: `gemini-2.5-pro`, Embeddings: `text-embedding-004` |
| **Orchestration** | LangGraph.js (`@langchain/langgraph`) | State graph: `classify ∥ retrieve → reason → score` |
| **Languages** | Hindi (`hi`) + English (`en`) | Bilingual by data, not by code branching |

---

## 3. Architecture Overview

```
BROWSER                                          BACKEND (Node.js)
┌──────────────────────────┐                     ┌──────────────────────────────┐
│ Call Simulator            │                     │                              │
│ (scripted demo / live mic)│                     │  POST /api/analyze (REST)    │
│         ↓                 │                     │  (LangGraph full pipeline)   │
│ Web Speech API (ASR)      │                     │                              │
│         ↓                 │                     │  WebSocket: analyze_reasoner │
│ Live Transcript Pane      │                     │  ├─ Retriever (RAG)          │
│         ↓                 │                     │  └─ Reasoner (Gemini LLM)    │
│ [Web Worker: BERT]────────┤── if warn/block ──→ │                              │
│ Local Risk Scorer         │    (WebSocket)      └──────────────────────────────┘
│         ↓                 │         ↓
│ Risk Meter (0-100 gauge)  │   Refined signals +
│ Scam Alert Overlay        │   bilingual alertText
│ Safe Word Verify          │
└──────────────────────────┘
```

**Two code paths exist (slight inconsistency to be aware of)**:
1. `POST /api/analyze` — full LangGraph pipeline (classifier → retriever → reasoner → scorer). This is the REST endpoint defined in `backend/src/routes/analyze.js` and orchestrated by `backend/src/agent/graph.js`.
2. **WebSocket `analyze_reasoner`** — only runs retriever + reasoner (skips backend classifier + scorer). The frontend currently uses this path, doing Tier 1 classification locally in the browser and scoring locally too.

The `graph.js` LangGraph pipeline is wired up but **not actively used by the current frontend flow** — the frontend bypasses it by running classification + scoring client-side and only calling the backend for RAG + reasoning via WebSocket.

---

## 4. File Map (What's Where)

```
hackathon-project/
├── ARCHITECTURE.md              # Detailed spec (308 lines) — the "source of truth"
├── BUILD_PROMPTS.md             # Step-by-step build prompts used to create the project
├── ON_DEVICE_MODELS.md          # Research notes on on-device model options
├── README.md                    # Setup, run instructions, 3 demo scripts
├── CLAUDE_HANDOFF.md            # ← This file
├── data/
│   ├── scam_taxonomy.json       # 5 signals + weights + 3 escalation rules
│   └── sample_advisories.json   # ~6 mock I4C/1930 advisories for RAG
├── backend/
│   ├── .env.example             # GEMINI_API_KEY, PORT, model names
│   └── src/
│       ├── server.js            # Express + Socket.IO, boot sequence
│       ├── config.js            # Env loader
│       ├── routes/analyze.js    # REST endpoint (uses LangGraph)
│       ├── agent/
│       │   ├── graph.js         # LangGraph state graph (classify ∥ retrieve → reason → score)
│       │   ├── classifier.js    # Backend BERT classifier (Xenova/bert-base-multilingual)
│       │   ├── retriever.js     # Gemini embeddings + cosine similarity RAG
│       │   ├── reasoner.js      # Gemini LLM structured-output reasoning
│       │   ├── riskScorer.js    # Deterministic scoring (weights + escalation rules)
│       │   └── riskScorer.test.js  # Unit tests for risk scorer
│       └── lib/
│           └── geminiClient.js  # Shared Gemini SDK instance
├── frontend/
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx              # Main app — state management, WebSocket, Worker init
│       ├── main.jsx
│       ├── index.css            # Tailwind + custom Framer-style design system
│       ├── components/
│       │   ├── CallSimulator.jsx    # Script picker + live mic, word-by-word playback
│       │   ├── LiveTranscript.jsx   # Rolling transcript display
│       │   ├── RiskMeter.jsx        # 0-100 gauge (green → amber → red)
│       │   ├── ScamAlertOverlay.jsx # Full-screen alert with TTS
│       │   ├── SafeWordSetup.jsx    # Family passphrase setup/verify
│       │   └── LanguageToggle.jsx   # hi/en toggle
│       ├── hooks/
│       │   ├── useSpeechRecognition.js  # Web Speech API wrapper
│       │   └── useSpeechSynthesis.js    # speechSynthesis for TTS alerts
│       ├── services/
│       │   ├── api.js               # fetch wrapper (for REST path)
│       │   └── riskScorer.js        # Client-side deterministic scorer (mirrors backend)
│       ├── workers/
│       │   └── classifier.worker.js # Browser BERT classifier (Web Worker)
│       └── data/
│           ├── scam_taxonomy.json   # Copy of root data for client-side scoring
│           └── scam_taxonomy.json   # (Same)
```

---

## 5. How to Run

```bash
# Backend
cd backend
cp .env.example .env   # Add GEMINI_API_KEY
npm install
npm start              # http://localhost:4000

# Frontend (new terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

---

## 6. What Works Right Now

- ✅ **3 scripted demo scenarios** play back word-by-word at natural pace (Hindi digital arrest, English KYC scam, benign false-positive check)
- ✅ **Live mic mode** via Web Speech API (Chrome/Edge)
- ✅ **Browser-local BERT classification** via Web Worker (zero-shot, no network)
- ✅ **Client-side risk scoring** with deterministic rules from `scam_taxonomy.json`
- ✅ **Risk Meter** updates live (green → amber → red)
- ✅ **Scam Alert Overlay** fires on warn/block with TTS
- ✅ **WebSocket Tier 2** calls backend for RAG retrieval + Gemini reasoning
- ✅ **Bilingual UI** (Hindi/English toggle)
- ✅ **Family Safe Word** setup and verify flow
- ✅ **Premium dark-mode UI** with glassmorphism, Framer-style cards, micro-animations
- ✅ **Backend LangGraph pipeline** fully wired (though frontend currently bypasses it)
- ✅ **Unit tests** for risk scorer

---

## 7. Known Issues & Rough Edges

### Critical
1. **Model download on first load**: The browser-local BERT model (~85MB) downloads on first page load. There's no caching indicator beyond the status text in the header. **First-load experience is poor.**
2. **WebSocket hardcoded URL**: `App.jsx` line 83 hardcodes `io('http://localhost:4000')`. No env-based config.
3. **CORS is restrictive**: Only `localhost:5173` and `localhost:4173` are allowed. Production deploy would fail.

### UX Polish Needed
4. **No call timer visible** — `elapsedSecondsRef` tracks time but it's never rendered in the UI.
5. **Alert overlay dismissal** stops the call — might not be the desired UX for "warn" (vs "block").
6. **No signal breakdown panel** — detected signals exist in state but aren't displayed anywhere during the call (only in the overlay).
7. **Knowledge Base References section** only appears after Tier 2 fires — most of the time you just see the risk meter.
8. **No "Report to 1930" flow** — the overlay mentions it but there's no stub modal.

### Architectural
9. **Duplicated risk scorer** — `frontend/src/services/riskScorer.js` and `backend/src/agent/riskScorer.js` are near-identical but maintained separately. DRY violation.
10. **`graph.js` is unused** in the live flow — the REST `POST /api/analyze` endpoint uses LangGraph, but the frontend's WebSocket path bypasses it entirely, calling retriever + reasoner directly from `server.js`.
11. **Backend classifier downloads a different model** (`bert-base-multilingual-cased-finetuned-xnli`) than the frontend worker (`mobilebert-uncased-mnli`). Different thresholds too (0.85 vs 0.6).
12. **No error recovery** — if the Gemini API key is missing/invalid, the backend logs a warning but the frontend has no indication that Tier 2 is degraded.

---

## 8. Enhancement Priorities (Suggested)

### 🔴 P0 — Demo-Day Critical (Do These First)
- [ ] **Add a real-time signal detection panel** visible during the call (show which signals are active, their confidence, evidence phrases) — this is the #1 thing judges want to see.
- [ ] **Add a visible call timer** (elapsed seconds) in the Call Simulator card.
- [ ] **Improve first-load UX** — show a proper loading screen/progress bar while the BERT model downloads, with a clear message explaining what's happening.
- [ ] **Make the Tier 2 activation visible** — when the WebSocket fires, show a clear "Deep Analysis Running..." state with what it's doing (retrieving advisories, reasoning).

### 🟡 P1 — Polish & Robustness
- [ ] **Unify the data flow** — either use the LangGraph REST pipeline everywhere, or document clearly why the WebSocket shortcut exists. Right now it's confusing.
- [ ] **Environment-based config** for WebSocket URL and API endpoints (use Vite's `import.meta.env`).
- [ ] **Add the "Report 1930" stub modal** in the alert overlay — even if fake, judges expect to see the complete flow.
- [ ] **Add a "Call History" or "Session Summary"** panel that shows after a call ends — total signals detected, risk trajectory, advisory matches.
- [ ] **Improve the benign call demo** — currently it sometimes triggers false positives on the BERT model because the threshold (0.6) is too low for context-free classification.
- [ ] **Add smooth transitions** when the risk level changes (animate the gauge, pulse the card border color).

### 🟢 P2 — Impressive Extras
- [ ] **Add a network visualization** of the agentic pipeline — show nodes lighting up as they execute (classify → retrieve → reason → score). This directly validates the "agentic AI" claim.
- [ ] **Add audio visualization** (waveform/bars) during live mic mode.
- [ ] **Add a "How It Works" explainer** section/modal with the architecture diagram.
- [ ] **Add confidence breakdown** per signal (bar chart or radar chart).
- [ ] **Multi-language expansion** — add Tamil/Telugu demo scripts (architecture already supports this via the `{en, hi}` pattern).
- [ ] **PWA support** — make it installable, which reinforces the "on-device" narrative.
- [ ] **Real-time transcript highlighting** — highlight scam-signal phrases in red/amber as they're detected.

---

## 9. Scam Taxonomy (5 Signals)

| Signal ID | Weight | Description |
|---|---|---|
| `urgency` | 15 | Artificial time pressure ("act now", "10 minutes") |
| `authority` | 20 | Claims to be CBI/police/bank ("I am from CBI") |
| `secrecy` | 20 | Isolates victim ("don't tell anyone", "stay on the line") |
| `threat` | 20 | Arrest/legal threats ("warrant issued", "account frozen") |
| `payment` | 60 | Asks for money/OTP/UPI PIN ("share the OTP") |

**Escalation Rules** (bonus points):
- `authority + payment within 60s` → +30
- `secrecy + threat` → +15
- `all 5 signals present` → +25

**Action Thresholds**: `<60` = monitor, `60-84` = warn, `≥85` = block

---

## 10. Key Design Decisions to Preserve

1. **Risk scorer is deterministic, not LLM** — this is a core architectural principle. The LLM produces evidence; plain rules produce the decision.
2. **Audio never leaves the browser** — Web Speech API processes audio locally; only text transcripts go to the backend.
3. **Bilingual by data, not by code** — all strings use `{en, hi}` objects. Adding a language = adding data, not code.
4. **Tier 1 is fully offline** — browser classification + scoring works with zero network. Tier 2 is cloud-enhanced, not cloud-dependent.
5. **LangGraph is the orchestration layer** — even if the current flow shortcuts it, the graph exists and should be the canonical pipeline.

---

## 11. Environment Variables

```env
# backend/.env
GEMINI_API_KEY=your_key_here
PORT=4000
CLASSIFIER_MODEL=gemini-2.5-flash
REASONER_MODEL=gemini-2.5-pro
EMBEDDING_MODEL=text-embedding-004
```

The backend classifier currently uses `@xenova/transformers` (local BERT), not Gemini — so `CLASSIFIER_MODEL` in `.env` is only used if you switch back to the Gemini-based classifier path via the LangGraph REST pipeline.

---

## 12. Commands Reference

```bash
# Run backend
cd backend && npm start

# Run frontend dev
cd frontend && npm run dev

# Build frontend for production
cd frontend && npm run build

# Run risk scorer unit tests
cd backend && node --test src/agent/riskScorer.test.js
```

---

*This document was generated to help a new AI agent (Claude Code) pick up this project and take it to the next level. Read `ARCHITECTURE.md` for the full 308-line spec, and `BUILD_PROMPTS.md` for the original step-by-step build instructions.*
