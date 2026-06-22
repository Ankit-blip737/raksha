# Raksha — Architecture Specification (Web Demo Build)

> This document is the single source of truth for the AI coding agent (Antigravity / Gemini 3.1 Pro). It describes what to build, why, and the exact contracts between components. Read this fully before generating code. When a prompt in `BUILD_PROMPTS.md` references "the architecture," it means this file.

---

## 1. What We're Building (and Why It Differs Slightly From the Pitch Deck)

The original pitch deck describes a **native Android app** with **fully on-device** ASR (IndicWhisper), classification (IndicBERT/MuRIL), and reasoning (quantized Sarvam-1/Gemma-2B) — built for a multi-phase hackathon roadmap ending in a telecom-scale product.

For this build, we are implementing a **web app demo** that proves the same core concept — *detect the scam pattern in a conversation, not the voice* — end-to-end, fast enough to demo, and architected so every "cloud" piece has a clearly marked future swap-in for the on-device equivalent named in the deck. Nothing in the original narrative changes; only the implementation substrate does.

| Pitch Deck Concept | This Build's Implementation | Future On-Device Swap (Phase 4) |
|---|---|---|
| Android Telecom API call capture | Browser microphone (`getUserMedia`), simulating a live call | Android `CallScreeningService` / Telecom API |
| IndicWhisper / IndicConformer ASR | Browser Web Speech API (`SpeechRecognition`, `hi-IN` / `en-IN`) | IndicWhisper ONNX/TFLite on-device |
| IndicBERT / MuRIL signal classifier | Gemini API structured-output call (Stage 3a) | Fine-tuned IndicBERT, quantized |
| Sarvam-1 / Gemma-2B LLM reasoner | Gemini API reasoning call (Stage 3b) | Quantized Gemma-2B/Sarvam-1 on-device |
| FAISS RAG over I4C/1930/RBI | In-memory embedding search over a local JSON corpus (Gemini embeddings) | FAISS on-device index |
| LangGraph agent orchestrator | LangGraph.js running on a Node backend | Same — LangGraph can run on-device or stay server-side |
| IndicTTS spoken alert | Browser Speech Synthesis API (`speechSynthesis`) | AI4Bharat IndicTTS |
| Android overlay UI | React overlay component (full-screen modal) | Android overlay window |

**Important privacy note for the demo:** because ASR runs in the browser (Web Speech API), raw audio in this build is processed by the browser's speech engine, not by our backend — our backend only ever sees **text transcripts**, never audio. This preserves the spirit of "audio never leaves the device for our system" even though it isn't the fully sovereign on-device stack from the deck. State this explicitly in the demo narration.

### Scope locked in for this build
- **Platform**: Web app (React frontend + Node.js backend). No native mobile code.
- **AI core**: Hybrid — Gemini API does the heavy lifting now; every AI call is isolated behind an interface so it can be swapped for an on-device model later without touching the rest of the system.
- **Languages**: Hindi (`hi`) and English (`en`) only. Code should not hardcode "2 languages" anywhere — read from a config list so adding Tamil/Telugu later is a data change, not a code change.
- **No real phone calls**: the "call" is simulated via live mic input or pre-scripted demo transcripts (see §10, Demo Script). This is explicitly *not* attempting real call interception — that's a legal/permissions-heavy native Android problem reserved for Phase 4.

---

## 2. High-Level Architecture

```
┌─────────────────────────┐
│        BROWSER           │
│                          │
│  ┌────────────────────┐  │
│  │ Call Simulator UI   │  │   getUserMedia() mic stream
│  │ (mic / demo script) │──┼──────────────┐
│  └────────────────────┘  │              │
│                          │              ▼
│  ┌────────────────────┐  │   ┌────────────────────────┐
│  │ Web Speech API      │◀─┼───│ Browser native ASR      │
│  │ (hi-IN / en-IN)      │  │   │ engine (no audio leaves │
│  └─────────┬──────────┘  │   │ the browser process)    │
│            │ text deltas  │   └────────────────────────┘
│            ▼              │
│  ┌────────────────────┐  │
│  │ Live Transcript Pane│  │
│  └─────────┬──────────┘  │
│            │ debounced POST (text only)
└────────────┼──────────────┘
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js + Express)                   │
│                                                                    │
│   POST /api/analyze  { sessionId, lang, transcriptWindow }         │
│            │                                                       │
│            ▼                                                       │
│   ┌─────────────────────────────────────────────────────────┐     │
│   │           LangGraph.js Orchestrator ("the agent")         │     │
│   │                                                           │     │
│   │  Node 1: Signal Classifier  ──▶  Node 2: Knowledge        │     │
│   │  (Gemini structured output)      Retriever (RAG over      │     │
│   │       │                          local advisory corpus)   │     │
│   │       ▼                                  │                │     │
│   │  Node 3: LLM Reasoner  ◀───────────────────┘               │     │
│   │  (Gemini, contextual reasoning + retrieved advisories)     │     │
│   │       │                                                   │     │
│   │       ▼                                                   │     │
│   │  Node 4: Risk Scorer (deterministic rules, NOT an LLM)     │     │
│   │  (escalation rules + thresholds → 0-100 score + action)   │     │
│   └─────────────────────────────────────────────────────────┘     │
│            │                                                       │
│            ▼                                                       │
│   Response: { riskScore, action, signals[], alertText, advisories[] } │
└────────────┼──────────────────────────────────────────────────────┘
             ▼
┌─────────────────────────┐
│        BROWSER           │
│  ┌────────────────────┐  │
│  │ Risk Meter (live)   │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │   if action == "warn" | "block":
│  │ Scam Alert Overlay  │◀─┼── render full-screen alert
│  │ (matches mockup)    │  │   + speechSynthesis.speak(alertText[lang])
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ Family Safe-Word    │  │
│  │ Verify Flow         │  │
│  └────────────────────┘  │
└─────────────────────────┘
```

**Key architectural decision: the risk scorer is deterministic code, not an LLM call.** The LLM (classifier + reasoner) produces *signals and evidence*; a plain rules engine turns those into a *score and action*. This makes the highest-stakes decision (warn/block) auditable, debuggable, and immune to LLM non-determinism — and it mirrors the pitch deck's own framing of "escalation rules," which were never described as LLM-driven.

---

## 3. Repository Structure

```
raksha-web-demo/
├── ARCHITECTURE.md                 # this file
├── BUILD_PROMPTS.md                # step-by-step agent prompts
├── README.md                       # setup + run instructions (generated in Prompt 0)
├── data/
│   ├── scam_taxonomy.json          # the 5-signal taxonomy + scoring rules (provided)
│   └── sample_advisories.json      # mock I4C/1930/RBI-style knowledge base (provided)
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── CallSimulator.jsx       # mic toggle + demo-script picker
│       │   ├── LiveTranscript.jsx      # rolling transcript display
│       │   ├── RiskMeter.jsx           # 0-100 gauge, color-coded
│       │   ├── ScamAlertOverlay.jsx    # full-screen alert (matches deck mockup)
│       │   ├── SafeWordSetup.jsx       # set/verify family passphrase
│       │   └── LanguageToggle.jsx      # hi / en switch
│       ├── hooks/
│       │   ├── useSpeechRecognition.js # wraps Web Speech API
│       │   └── useSpeechSynthesis.js   # wraps speechSynthesis for TTS alerts
│       └── services/
│           └── api.js                  # fetch wrapper for /api/analyze
└── backend/
    ├── package.json
    ├── .env.example
    └── src/
        ├── server.js
        ├── config.js
        ├── routes/
        │   └── analyze.js
        ├── agent/
        │   ├── graph.js          # LangGraph.js graph definition
        │   ├── classifier.js     # Gemini call → signal detection
        │   ├── retriever.js      # RAG over data/sample_advisories.json
        │   ├── reasoner.js       # Gemini call → contextual reasoning
        │   └── riskScorer.js     # deterministic scoring (reads data/scam_taxonomy.json)
        └── lib/
            └── geminiClient.js   # single shared Gemini SDK client
```

---

## 4. API Contract: `POST /api/analyze`

This is the **only** endpoint the frontend calls during a live call session. Treat this contract as fixed — both frontend and backend prompts must conform to it exactly.

### Request
```json
{
  "sessionId": "string (uuid, stable for the duration of one simulated call)",
  "lang": "hi | en",
  "transcriptWindow": "string — the last ~30-45 seconds of transcript text, not just the newest delta",
  "elapsedSeconds": "number — seconds since the call/session started, used for time-based escalation rules"
}
```

### Response
```json
{
  "riskScore": 87,
  "action": "monitor | warn | block",
  "signals": [
    {
      "id": "authority",
      "label": "Authority Impersonation",
      "evidencePhrase": "I am calling from the CBI",
      "confidence": 0.93
    }
  ],
  "alertText": {
    "en": "This call shows 6 signs of a digital-arrest scam. Real police never demand money by phone. Hang up and call 1930.",
    "hi": "इस कॉल में डिजिटल अरेस्ट स्कैम के 6 संकेत मिले हैं। असली पुलिस फोन पर पैसे की मांग नहीं करती। कॉल काटें और 1930 पर सूचना दें।"
  },
  "retrievedAdvisories": [
    { "id": "adv-001", "title": "Digital Arrest Scams", "relevance": 0.81 }
  ]
}
```

**Action thresholds** (also encoded in `data/scam_taxonomy.json`, do not duplicate magic numbers in code):
- `riskScore < 60` → `"monitor"` (no UI interruption, risk meter only)
- `60 ≤ riskScore < 85` → `"warn"` (show alert overlay, user can dismiss)
- `riskScore ≥ 85` → `"block"` (show alert overlay with Hang Up & Block emphasized, harder to dismiss)

---

## 5. The Agent Pipeline (Backend Detail)

### Node 1 — Signal Classifier (`classifier.js`)
- Input: `transcriptWindow`, `lang`
- Calls Gemini with a system prompt containing the 5-signal taxonomy from `scam_taxonomy.json` (urgency, authority, secrecy, threat, payment) and few-shot examples in both Hindi and English.
- **Must use structured/JSON output** (Gemini's response schema / controlled generation) — never free-text parsing. Output shape: array of `{id, evidencePhrase, confidence}`.
- This node should be fast and cheap — it does *not* need the retrieved advisories. It runs in parallel with Node 2.

### Node 2 — Knowledge Retriever (`retriever.js`)
- Input: `transcriptWindow`
- Embeds the transcript window and compares against pre-embedded entries in `sample_advisories.json` (embed once at server startup, cache in memory — do not re-embed the corpus on every request).
- Returns top-3 advisories by cosine similarity, each with a relevance score.
- Runs in parallel with Node 1 (both feed Node 3).

### Node 3 — LLM Reasoner (`reasoner.js`)
- Input: `transcriptWindow`, Node 1's signals, Node 2's retrieved advisories, `lang`
- Calls Gemini to: (a) sanity-check/adjust Node 1's signals using full conversational context (e.g., a signal classifier might flag "warrant" even in a benign movie-plot retelling — the reasoner's job is to catch that), and (b) draft the bilingual `alertText` using the matched advisory's framing.
- Output: refined `signals[]` + `alertText: {en, hi}`.

### Node 4 — Risk Scorer (`riskScorer.js`) — deterministic, no LLM
- Input: refined `signals[]`, `elapsedSeconds`
- Logic, in order:
  1. Sum each present signal's `weight` from `scam_taxonomy.json`.
  2. Apply every matching `escalation_rules` entry's `bonus` (e.g. authority+payment within 60s).
  3. Clamp to 0–100.
  4. Map to `action` via the thresholds in §4.
- This function must be pure and unit-testable with no network calls — see Prompt 6 in `BUILD_PROMPTS.md`.

### Orchestration (`graph.js`)
Use LangGraph.js to wire: `START → [classifier, retriever] → reasoner → riskScorer → END`. The graph state object should carry `{transcriptWindow, lang, elapsedSeconds, signals, advisories, alertText, riskScore, action}` and each node only writes its own keys. This is what lets us legitimately call this an "agentic" pipeline consistent with the pitch deck's framing, not just a chain of function calls.

---

## 6. RAG Knowledge Base

`data/sample_advisories.json` ships with ~6 entries covering the main scam archetypes named in the deck: digital arrest, KYC/bank update, OTP/UPI extraction, voice-clone fake emergency, courier/customs parcel scam, lottery/prize scam. Each entry has bilingual `summary.en` / `summary.hi` fields. This is a **demo-scale stand-in** for the real I4C/1930/RBI corpus described in the deck — call this out explicitly in any demo narration ("for the hackathon we seeded this with representative public scam patterns; production would ingest the live I4C/1930 feed").

Embedding strategy: use Gemini's embedding endpoint once per advisory at server boot, cache vectors in memory (a plain array is fine at this scale — no need for FAISS/a vector DB for ~6-20 documents). Note in code comments that FAISS is the named upgrade path per the deck once the corpus grows past a few hundred documents.

---

## 7. Frontend Behavior Spec

### Call Simulator
Two modes, switchable by the user:
1. **Live mic mode** — `getUserMedia` + Web Speech API `continuous: true`, `interimResults: true`, language set from the `LanguageToggle`. Useful for a live "say something scammy" demo.
2. **Scripted demo mode** — picks one of 3 pre-written transcripts (see §10) and plays them back as simulated streaming text at a natural speaking pace, so the demo is 100% reliable regardless of room noise/Wi-Fi. **Default to this mode for any judged demo.**

Either mode produces the same thing: a growing transcript string. Every ~3–5 seconds (debounced, not on every word), POST the last ~30-45s window to `/api/analyze`.

### Live Transcript Pane
Shows the rolling transcript, current language, and a subtle "Raksha is listening" indicator — never implies recording/storage, since nothing is persisted.

### Risk Meter
A horizontal gauge 0–100, green (<60) → amber (60–84) → red (≥85), updating after each `/api/analyze` response.

### Scam Alert Overlay
Recreate the pitch deck's mockup faithfully:
- Header: `⚠ SCAM ALERT — Risk: {riskScore}%`
- Bulleted list of detected `signals[].label` with the matched `evidencePhrase`
- The bilingual `alertText`, rendered in the active language
- Three actions: **Hang Up & Block** (primary, largest button), **Report 1930** (opens a stub modal — no real submission for the demo, label it clearly as a stub), **Verify: Call Back Family** (opens the Safe-Word flow)
- On mount, if `action !== "monitor"`, immediately speak `alertText[lang]` via `speechSynthesis`

### Family Safe-Word
Simple two-screen flow: (1) Setup — user sets a passphrase, stored in browser memory for the session (not persisted to any backend — this is a local, on-device-style feature even in the web demo); (2) Verify — during an alert, user enters the passphrase a "caller" would need to know; correct entry shows a green confirmation, incorrect shows "This may not be your family member — verify another way."

---

## 8. Environment & Configuration

`backend/.env.example`:
```
GEMINI_API_KEY=your_key_here
PORT=4000
CLASSIFIER_MODEL=gemini-2.5-flash
REASONER_MODEL=gemini-2.5-pro
EMBEDDING_MODEL=text-embedding-004
```
Pick the lighter model for the high-frequency classifier node and the stronger model for the low-frequency reasoner node — this mirrors the deck's own "fast classifier + heavier reasoner" two-tier design. (Exact model name strings should be confirmed against current Gemini API docs at build time, since model names change.)

Frontend needs no API keys — it only ever talks to our own backend, never directly to Gemini. This is a hard security rule: **no AI provider key is ever shipped to the browser.**

---

## 9. Non-Functional Notes

- **Latency budget for the demo**: aim for under ~2.5s from transcript-window POST to alert render. This won't match the deck's <500ms on-device target — say so plainly if asked; it's an honest tradeoff of cloud calls vs. on-device inference, not a hidden gap.
- **No audio persistence anywhere** — not in the browser, not on the backend. Only text transcripts and only for the duration of a session (in-memory; nothing written to a database in this build).
- **Bilingual by data, not by branching code** — every user-facing string (UI labels, taxonomy labels, advisory summaries, alert text) should be looked up from a `{en, hi}` object keyed by the active language, never an `if (lang === 'hi')` scattered through components.

---

## 10. Demo Script (3 Canned Scenarios)

Ship these as the default "scripted demo mode" transcripts so the live demo is reliable:

1. **Digital arrest scam (Hindi)** — caller claims to be from customs, references a parcel with banned items, threatens arrest, demands the victim stay on the line and transfer money to a "verification account." Should trigger `block` by ~40 seconds in.
2. **Bank KYC / OTP scam (English)** — caller claims to be from the bank's fraud department, says the account will be frozen unless KYC is "re-verified" right now, asks for the OTP. Should trigger `warn` then `block`.
3. **Benign call (English or Hindi)** — a normal conversation with a friend or a real customer-service call that mentions "urgent" or "bank" innocuously but should stay under `monitor` the whole time. **This scenario is essential** — it's the false-positive check, and judges will respect a team that demos a non-alert as deliberately as an alert.

---

## 11. What Is Explicitly Out of Scope for This Build

- Real Android call interception (Telecom API / CallScreeningService)
- On-device model inference (ONNX/TFLite)
- Real submission to the 1930 helpline (stub only)
- Persistent storage / accounts / multi-device sync
- The 20-language expansion (architecture supports adding languages as data, but only `hi`/`en` ship)
- Telecom/banking SDK integration

These remain accurately described in the pitch deck as Phase 3/4 roadmap items — this build is a faithful, honest Phase-2-style proof of the *detection concept*, not a shortcut claiming to be the full vision.
