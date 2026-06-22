# 🛡️ RAKSHA — Complete Project Documentation

> **Raksha** (रक्षा — Sanskrit for "Protection") is a real-time, privacy-first, AI-powered scam call detection shield built for India. It listens to phone calls, transcribes speech on-device, detects 5 scam manipulation signals using multilingual AI, and alerts the user — all without any audio ever leaving the browser.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Key Differentiators](#3-key-differentiators)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Frontend Deep Dive](#6-frontend-deep-dive)
7. [Backend Deep Dive](#7-backend-deep-dive)
8. [AI Models Used](#8-ai-models-used)
9. [The 5 Scam Signals (Taxonomy)](#9-the-5-scam-signals-taxonomy)
10. [Data Flow — End to End](#10-data-flow--end-to-end)
11. [File-by-File Breakdown](#11-file-by-file-breakdown)
12. [Deployment Architecture](#12-deployment-architecture)
13. [How to Run Locally](#13-how-to-run-locally)
14. [Phase-wise Development History](#14-phase-wise-development-history)
15. [Hackathon Pitch Guide](#15-hackathon-pitch-guide)
16. [Future Roadmap](#16-future-roadmap)

---

## 1. Problem Statement

India is facing an epidemic of phone-based financial scams:

- **Digital Arrest Scams**: Callers impersonate CBI/Police officers, claim a warrant has been issued, and demand immediate payment to "resolve" the case.
- **KYC/OTP Scams**: Callers pose as bank representatives, create urgency about account freezing, and extract OTPs and card details.
- **Courier/Customs Scams**: Callers claim a parcel with drugs/contraband was intercepted and linked to the victim's Aadhaar.

These scams disproportionately affect non-tech-savvy citizens, elderly people, and those unfamiliar with official procedures. They operate in Hindi, English, and code-switched Hinglish — making English-only NLP tools ineffective.

### The Gap in Existing Solutions

| Existing Approach | Why It Fails |
|---|---|
| Cloud-based call analysis | Sends private audio to remote servers — a privacy nightmare |
| English-only NLP models | Cannot understand Hindi/Hinglish — the primary languages of Indian scams |
| Simple keyword blocklists | Scammers constantly evolve their scripts; keyword matching is too brittle |
| Post-call detection | By the time the scam is detected, the money is already gone |

**Raksha fills every one of these gaps.**

---

## 2. Solution Overview

Raksha is a **browser-based, real-time scam detection system** that works during a live phone call:

1. **Listens** — Captures microphone audio in real-time
2. **Transcribes** — Converts speech to text using on-device Whisper ASR (audio never leaves the browser)
3. **Classifies** — Detects 5 scam manipulation signals using a multilingual embedding model running on WebGPU
4. **Scores** — Applies a deterministic, auditable risk scoring engine based on signal combinations and escalation rules
5. **Alerts** — Shows a visual warning overlay with evidence phrases, confidence scores, and recommended actions
6. **Retrieves** — Matches the call pattern against a knowledge base of known Indian scam types (RAG)
7. **Reasons** — Uses an LLM (Gemini or on-device WebLLM) to generate a human-readable alert explaining why this is a scam

### The Two-Tier Architecture

| Tier | Where It Runs | What It Does | Latency |
|---|---|---|---|
| **Tier 1** (On-Device) | Browser (WebGPU/WASM) | ASR + Signal Classification + Risk Scoring | ~200ms |
| **Tier 2** (Cloud-Enhanced) | Backend Server | RAG Retrieval + LLM Reasoning + Refined Scoring | ~500ms |

**Critical Design Principle:** Tier 1 is fully functional on its own. Even if the network goes down, Raksha still detects scams, scores risk, and alerts the user. Tier 2 only enhances the result with richer context and explanations.

---

## 3. Key Differentiators

### 3.1 Zero-Cloud Privacy
- Audio is captured by the browser's `getUserMedia` API
- Speech-to-text runs entirely on-device via Whisper (Transformers.js v3)
- Tier-1 classification runs on-device via WebGPU
- **No audio bytes ever leave the browser**

### 3.2 True Multilingual Support
- The classifier uses `multilingual-e5-small`, a sentence embedding model trained on 100+ languages
- Exemplar phrases are provided in English, Devanagari Hindi, and Romanized Hinglish
- The system detects scam signals regardless of which language the caller speaks

### 3.3 Real WebGPU Acceleration
- Uses `@huggingface/transformers` v3 (not v2) which has actual WebGPU support
- Falls back to WASM automatically if WebGPU is unavailable
- Includes a runtime degeneracy self-check to detect GPU quantization bugs

### 3.4 Auditable Deterministic Scoring
- The risk scorer is a pure function — no LLM, no randomness
- Weights and thresholds are defined in a JSON taxonomy file
- Tuning is a data change, not a code change
- The scorer is unit-tested with 13 test cases

### 3.5 Agentic Pipeline (LangGraph)
- The backend uses LangGraph.js — a real agentic framework
- The graph streams execution node-by-node over WebSockets
- The frontend visualizes the live execution trace (not a fake animation)
- A MemorySaver checkpointer enables session replay

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Frontend)                       │
│                                                                 │
│  ┌──────────┐   ┌────────────┐   ┌──────────────┐              │
│  │ Mic Audio │──▶│ Whisper    │──▶│ Live         │              │
│  │ Capture   │   │ ASR Worker │   │ Transcript   │              │
│  └──────────┘   └────────────┘   └──────┬───────┘              │
│                                          │                      │
│                                   ┌──────▼───────┐             │
│                                   │ Classifier   │             │
│                                   │ Worker       │             │
│                                   │ (WebGPU)     │             │
│                                   └──────┬───────┘             │
│                                          │                      │
│                           ┌──────────────▼──────────────┐      │
│                           │  Risk Scorer (Deterministic) │      │
│                           └──────────────┬──────────────┘      │
│                                          │                      │
│          ┌───────────────────────────────▼────────────┐        │
│          │           Zustand Store + XState FSM        │        │
│          │   (signals, risk, action, pipeline trace)   │        │
│          └───────────────────────────────┬────────────┘        │
│                                          │                      │
│    ┌──────────┬──────────┬───────────┬───▼──────┐              │
│    │ Pipeline │ Signal   │ Risk     │ Scam     │              │
│    │ Viz      │ Panel    │ Meter    │ Alert    │              │
│    └──────────┴──────────┴─────────┴──────────┘              │
│                                                                 │
│                    Socket.IO Connection                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER (Backend)                         │
│                                                                 │
│    ┌────────────────────────────────────────────┐               │
│    │            LangGraph State Machine          │               │
│    │                                            │               │
│    │  START ──┬──▶ classifyNode ──┐             │               │
│    │         │                   ├──▶ reasonNode ──▶ scoreNode  │
│    │         └──▶ retrieveNode ──┘             │               │
│    │                                            │               │
│    └────────────────────────────────────────────┘               │
│                                                                 │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│    │ Classifier   │  │ Retriever    │  │ Reasoner     │        │
│    │ (Server-side)│  │ (RAG)        │  │ (Gemini LLM) │        │
│    └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Technology Stack

### Frontend
| Technology | Purpose | Version |
|---|---|---|
| React | UI framework | 18.3 |
| Vite | Build tool & dev server | 5.3 |
| Zustand | Global state management | 5.0 |
| XState | Finite State Machine for call lifecycle | 5.32 |
| @huggingface/transformers | On-device ML inference (WebGPU) | 3.5 |
| @mlc-ai/web-llm | On-device LLM inference (WebGPU) | 0.2.84 |
| Socket.IO Client | Real-time backend communication | 4.8 |
| TailwindCSS | Utility-first CSS framework | 3.4 |
| Web Workers | Background thread for ML models | Native |
| Web Audio API | Microphone capture & audio processing | Native |

### Backend
| Technology | Purpose | Version |
|---|---|---|
| Node.js | Runtime | 22 |
| Express | HTTP server | 4.19 |
| Socket.IO | WebSocket server | 4.8 |
| @langchain/langgraph | Agentic graph orchestration | 0.2 |
| @google/generative-ai | Gemini API (Tier-2 reasoning) | 0.24 |
| dotenv | Environment configuration | 16.4 |

### Infrastructure
| Technology | Purpose |
|---|---|
| Docker | Containerization (backend & frontend) |
| Docker Compose | Local multi-container orchestration |
| Vercel | Frontend deployment (SPA) |
| Render / Railway | Backend deployment (free tier) |
| Nginx | Production frontend serving (in Docker) |

---

## 6. Frontend Deep Dive

### 6.1 Web Workers (Background Threads)

The frontend uses 4 dedicated Web Workers to keep ML inference off the main UI thread:

#### `classifier.worker.js` — Tier-1 Scam Signal Detector
- **Model**: `Xenova/multilingual-e5-small` (sentence embeddings)
- **Device**: WebGPU (fp16) with WASM (fp32) fallback
- **Algorithm**: SetFit-style prototype matching
  1. On init: embeds ~70 exemplar phrases (English + Hindi + Hinglish) per signal
  2. On classify: embeds the live transcript sentences, computes cosine similarity against each signal's exemplars
  3. Returns detected signals with confidence scores and evidence phrases
- **Degeneracy Self-Check**: After model load, embeds two clearly unrelated sentences. If cosine similarity ≥ 0.9, the GPU/dtype is rejected and falls back to WASM fp32. This catches a critical bug where q8-quantized models on WebGPU produce degenerate embeddings.

#### `whisper.worker.js` — On-Device Speech Recognition
- **Model**: `Xenova/whisper-tiny` (ASR)
- **Input**: 2.5-second Float32Array audio chunks at 16kHz
- **Output**: Transcribed text (auto-detects Hindi/English/Hinglish)
- **Privacy**: Audio bytes never leave the browser

#### `llm.worker.js` — On-Device LLM (Fully Offline Mode)
- **Model**: `Qwen2.5-1.5B-Instruct` via MLC WebLLM
- **Purpose**: When enabled, replaces the cloud Gemini reasoner entirely
- **Capability**: Generates scam analysis alerts, performs reasoning about detected signals — all on-device

#### `voiceClone.worker.js` — Voice Clone / Deepfake Detection (Experimental)
- **Purpose**: Analyzes raw PCM audio for synthetic voice patterns
- **Status**: Wired and receiving audio chunks; model integration in progress

### 6.2 React Hooks

#### `useWhisperASR.js` — Microphone → Whisper Pipeline
This hook manages the complete audio capture and transcription lifecycle:

1. **Initializes** the Whisper Web Worker on mount
2. **Captures** microphone audio via `getUserMedia` and `AudioContext`
3. **Resamples** from the native sample rate (usually 44.1kHz/48kHz) down to 16kHz
4. **Normalizes** the audio amplitude (prevents Whisper from rejecting low-volume input)
5. **Chunks** audio into 2.5-second windows and sends to the worker
6. **Accumulates** transcription results, trimming to 300 words max
7. **Dispatches** raw audio chunks to the Voice Clone worker via `window.dispatchAudioChunk`
8. **Exposes** volume level for the UI volume meter
9. **Reports** microphone errors for debugging

Key technical details:
- Uses `ScriptProcessorNode` (widely supported) for raw PCM capture
- Connects to `audioCtx.destination` through a zero-gain `GainNode` to prevent browser echo cancellation from muting the input
- Nearest-neighbor downsampling from native SR to 16kHz

#### `useSpeechRecognition.js` — Browser Web Speech API (Legacy)
- Uses Chrome's built-in `SpeechRecognition` API
- Sends audio to Google's cloud servers (NOT privacy-preserving)
- Kept as a fallback / comparison mode labeled "Live Mic"
- Auto-restarts on recognition end for continuous listening

### 6.3 State Management

#### `callMachine.js` — XState v5 Finite State Machine
Models the call lifecycle as a deterministic state machine:

```
idle → active → warn ⇄ active
                  ↓
               block → ended → idle
```

**State transitions:**
| From | Event | To | Description |
|---|---|---|---|
| idle | START | active | User starts a call/demo |
| active | RISK (warn) | warn | Risk score crosses warn threshold (60) |
| active | RISK (block) | block | Risk score crosses block threshold (85) |
| warn | ACK | active | User acknowledges warning, call continues |
| warn | RISK (block) | block | Risk escalates from warn to block |
| block | ACK | ended | User acknowledges block, call terminates |
| ended | RESET | idle | Ready for next call |

**Critical UX fix**: Dismissing a `warn` keeps the call alive (ACK → active), but acknowledging a `block` ends the call (ACK → ended). This was previously ambiguous.

#### `useRakshaStore.js` — Zustand Store
Holds all call/pipeline data:
- `signals` — Array of detected scam signals with confidence and evidence
- `riskScore` — 0-100 numeric risk score
- `action` — 'monitor' | 'warn' | 'block'
- `advisories` — Matched knowledge base entries
- `alertText` — LLM-generated alert explanation
- `pipeline` — Live execution trace (node statuses, events, timing)

### 6.4 UI Components

#### `CallSimulator.jsx` — The Main Input Panel
Three operating modes:
1. **Scripted Demo**: Plays pre-written scam transcripts word-by-word (3 scripts: Hindi Digital Arrest, English KYC, Benign)
2. **Live Mic**: Uses browser's Web Speech API (cloud-based, for comparison)
3. **Whisper ASR**: Uses on-device Whisper (privacy-preserving, the recommended mode)

#### `PipelineViz.jsx` — Live Agentic Pipeline Visualization
Renders the LangGraph execution trace in real-time:
- Shows 4 nodes: Classify → Retrieve → Reason → Score
- Each node transitions: pending (gray) → active (pulsing) → done (colored)
- Displays real latencies (e.g., "Classify: 5 signals +13ms")
- Driven by actual streamed `node_update` events from the backend — not an animation

#### `SignalPanel.jsx` — Live Signal Detection Panel
Shows each of the 5 scam signals with:
- Color-coded icon (red for threat, amber for payment, violet for secrecy, etc.)
- Confidence percentage (e.g., "Authority 98%")
- The exact evidence phrase from the transcript

#### `RiskMeter.jsx` — Visual Risk Score
- Gradient bar from green (0) → amber (60, warn threshold) → red (85, block threshold)
- Shows current score, threshold markers, and the current action label
- Animated transitions on score changes

#### `LiveTranscript.jsx` — Highlighted Transcript
- Displays the rolling transcript text
- Highlights detected evidence phrases in their signal's color
- Uses regex-based matching against the signals' `evidencePhrase` fields

#### `ScamAlertOverlay.jsx` — Full-Screen Alert
When risk crosses the block threshold:
- Full-screen red overlay with warning animation
- Lists all detected signals with evidence and confidence
- Shows matched Knowledge Base advisories
- Triggers text-to-speech alert (browser's `SpeechSynthesis` API)
- Action buttons: "I'm Safe" (acknowledge) and emergency actions

#### `ModelLoadingScreen.jsx` — First-Load Experience
Shown while the ML models download and warm up:
- Full-screen overlay with "Arming your on-device shield" message
- Live progress bar tracking model download percentage
- Device badge showing ⚡WebGPU or 🧩WASM

#### `SafeWordSetup.jsx` — Emergency Contact Configuration
Allows users to set up a trusted contact who can be alerted during a scam call.

#### `OfflineModePanel.jsx` — Fully Offline Mode Toggle
Enables the WebLLM-powered fully offline mode where even Tier-2 reasoning runs on-device.

### 6.5 Shared Libraries

#### `embeddingClassifier.js` — The Classification Algorithm
Runtime-agnostic (no model imports — caller supplies an `embed` function):

1. **`splitSentences(text)`** — Two-pass sentence splitter:
   - Pass 1: Split on sentence delimiters (`.!?।\n`)
   - Pass 2: Sub-split only long sentences (>8 words) on clause delimiters (`,;:—`)
   - Keeps short sentences whole (avoids false positives on "Hey Priya")

2. **`buildSignalIndex(exemplars, embed)`** — One-time setup:
   - Takes ~70 exemplar phrases across 5 signals
   - Embeds all of them in a single batch
   - Returns a lookup: `signalId → array of embedding vectors`

3. **`classifySentences(sentences, index, embed, opts)`** — Per-window classification:
   - Embeds all live sentences in one forward pass
   - For each sentence × signal: compute cosine similarity against all exemplars
   - Keep the best match per signal (highest similarity above the per-signal threshold)
   - Returns: `[{ id: 'authority', evidencePhrase: 'CBI Delhi se...', confidence: 0.98 }, ...]`

#### `signalMeta.js` — Signal Metadata
Maps signal IDs to display properties (colors, icons, labels in English/Hindi).

### 6.6 Data Files

#### `signal_exemplars.json` — The Heart of Classification
Contains ~70 exemplar phrases across 5 signals, in 3 languages:
- **English**: "I am calling from the CBI"
- **Hindi (Devanagari)**: "मैं सीबीआई से बोल रहा हूं"
- **Hinglish (Romanized)**: "main CBI se baat kar raha hoon"

Also contains per-signal cosine similarity thresholds:
```json
{
  "urgency": 0.63,
  "authority": 0.75,
  "secrecy": 0.62,
  "threat": 0.62,
  "payment": 0.64
}
```

These thresholds were tuned empirically against the 3 demo scripts so that:
- Hindi Digital Arrest → 5/5 signals detected → block ✓
- English KYC Scam → 4-5/5 signals detected → block ✓
- Benign call (with trap phrases like "freeze accounts", "warrant", "bank thing") → 0 signals → stays green ✓

---

## 7. Backend Deep Dive

### 7.1 Server (`server.js`)

Express + Socket.IO server with:
- **CORS**: Configurable via `CORS_ORIGINS` env var (defaults to localhost dev ports)
- **Health check**: `GET /health` returns model configuration
- **REST endpoint**: `POST /api/analyze` for one-shot analysis
- **WebSocket events**:
  - `analyze_stream` → streams the LangGraph node-by-node
  - `analyze_reasoner` → legacy non-streaming path (kept for backward compat)

### 7.2 LangGraph (`graph.js`) — The Agentic Orchestrator

This is the single source of truth for the analysis pipeline. It is a `StateGraph` with 4 nodes:

```
START ──┬──▶ classifyNode ──┐
        │                   ├──▶ reasonNode ──▶ scoreNode ──▶ END
        └──▶ retrieveNode ──┘
```

**Parallel fan-out**: `classify` and `retrieve` run simultaneously (not sequentially), cutting latency nearly in half.

**State shape** (flows through the graph):
```javascript
{
  sessionId,          // caller-provided session ID
  transcriptWindow,   // the live transcript text
  lang,               // 'en' or 'hi'
  elapsedSeconds,     // call duration (used by escalation rules)
  clientSignals,      // Tier-1 signals from the browser (if provided)
  signals,            // classified signals (output of classifyNode)
  advisories,         // matched knowledge base entries (output of retrieveNode)
  alertText,          // LLM-generated alert (output of reasonNode)
  riskScore,          // 0-100 risk score (output of scoreNode)
  action,             // 'monitor' | 'warn' | 'block' (output of scoreNode)
}
```

**Two transports, one graph**:
- `runRakshaGraph(input)` — blocking `.invoke()` for REST
- `streamRakshaGraph(input)` — async `.stream()` for WebSocket (yields node updates)

**Checkpointer**: `MemorySaver` keyed by sessionId enables session replay and time-travel debugging.

### 7.3 Classifier (`classifier.js`) — Server-Side Signal Detection

Server-side fallback classifier (used when browser doesn't send Tier-1 signals):
- Uses keyword/pattern matching against the transcript
- Maps to the same 5 signal IDs as the browser classifier

### 7.4 Retriever (`retriever.js`) — Knowledge Base RAG

Two retrieval modes that degrade gracefully:

**Mode 1 — Semantic Search (when GEMINI_API_KEY is set)**:
- Embeds all advisories using Gemini's `text-embedding-004` model
- Embeds the live transcript
- Returns top-K advisories by cosine similarity

**Mode 2 — Lexical Fallback (when no API key or embedding fails)**:
- Scores advisories by tag overlap with detected signals (+2 per match)
- Bonus for keyword hits from advisory tags appearing in the transcript
- Normalized to 0-1 relevance score

**Knowledge Base** (`sample_advisories.json`): 
Contains real advisory entries matching Indian scam patterns:
- Digital Arrest Scams
- Courier/Customs Parcel Scams
- KYC/OTP Fraud
- Investment Scams
- And more...

Each advisory has:
- Bilingual title (en/hi)
- Bilingual summary
- Tags for lexical matching
- Source attribution (e.g., "National Cyber Crime Reporting Portal")

### 7.5 Reasoner (`reasoner.js`) — LLM Alert Generator

Uses Google Gemini to generate human-readable alert text:
- **Input**: transcript + detected signals + matched advisories
- **Output**: Alert text in English and Hindi
- **Fallback**: If Gemini is unavailable, generates a template-based alert from the signals

The prompt instructs Gemini to:
1. Analyze the transcript for scam patterns
2. Reference the matched advisories
3. Explain which signals were detected and why
4. Provide actionable advice to the user

### 7.6 Risk Scorer (`riskScorer.js`) — Deterministic Scoring Engine

A pure function with zero randomness:

**Step 1 — Base weights** (from `scam_taxonomy.json`):
| Signal | Weight |
|---|---|
| urgency | 15 |
| authority | 20 |
| secrecy | 15 |
| threat | 20 |
| payment | 25 |

**Step 2 — Escalation rule bonuses**:
| Rule | Condition | Bonus |
|---|---|---|
| `authority_plus_payment_60s` | Authority + Payment within 60 seconds | +15 |
| `secrecy_plus_threat` | Secrecy + Threat together | +10 |
| `all_five_signals` | All 5 signals detected | +20 |
| `voice_clone_plus_payment` | Voice clone + Payment | +20 |
| `voice_clone_detected` | Any voice clone signal | +10 |

**Step 3 — Threshold mapping**:
| Score Range | Action | UI Response |
|---|---|---|
| 0 – 59 | `monitor` | Green — normal |
| 60 – 84 | `warn` | Amber — warning overlay |
| 85 – 100 | `block` | Red — block overlay |

**Example**: Hindi Digital Arrest call with all 5 signals + escalation bonuses = 100 → `block`

---

## 8. AI Models Used

| Model | Type | Size | Where It Runs | Purpose |
|---|---|---|---|---|
| `Xenova/multilingual-e5-small` | Sentence Embeddings | ~235 MB (fp16) | Browser (WebGPU) | Tier-1 scam signal classification |
| `Xenova/whisper-tiny` | ASR (Speech-to-Text) | ~40 MB | Browser (WASM) | On-device speech transcription |
| `Qwen2.5-1.5B-Instruct` | Instruction LLM | ~1 GB (q4) | Browser (WebGPU) | Fully offline reasoning (optional) |
| `gemini-1.5-flash` | Cloud LLM | N/A | Google Cloud | Tier-2 reasoning & alert generation |
| `text-embedding-004` | Cloud Embeddings | N/A | Google Cloud | Semantic advisory retrieval (RAG) |

### Model Selection Rationale

**Why `multilingual-e5-small` over MobileBERT?**
- MobileBERT is English-only and uncased — it cannot read Hindi/Devanagari at all
- E5-small supports 100+ languages including Hindi and Hinglish
- One forward pass per sentence (vs 5 for zero-shot NLI)
- Smaller and faster

**Why fp16 on WebGPU (not q8)?**
- During testing, q8-quantized models on WebGPU produced degenerate embeddings where every sentence scored ~0.98 against every signal (a critical false-positive bug)
- fp16 produces correct, discriminative embeddings
- A runtime self-check detects this and auto-falls-back to WASM fp32

**Why Whisper-tiny?**
- Smallest Whisper variant (~40 MB) for fast download
- Supports Hindi + English + auto-detection
- Good enough for scam phrase detection (not transcription-perfect, but captures the scam keywords)

---

## 9. The 5 Scam Signals (Taxonomy)

Raksha detects 5 manipulation signals commonly used in Indian financial scams:

### 1. 🔴 Urgency
**What it detects**: Time pressure tactics forcing immediate action
**Examples**:
- "You must act now within 10 minutes"
- "यह आपका आखिरी मौका है" (This is your last chance)
- "abhi nahi kiya to problem ho jayegi"

### 2. 🟣 Authority
**What it detects**: Impersonation of government/bank officials
**Examples**:
- "I am calling from the CBI"
- "मैं सीबीआई दिल्ली से बोल रहा हूँ" (I am speaking from CBI Delhi)
- "main inspector bol raha hoon"

### 3. 🔵 Secrecy
**What it detects**: Isolation tactics preventing the victim from seeking help
**Examples**:
- "Don't tell anyone about this call"
- "यह पूरी तरह गोपनीय है" (This is completely confidential)
- "kisi ko mat batana"

### 4. 🟠 Threat
**What it detects**: Intimidation through legal/financial consequences
**Examples**:
- "A warrant has been issued in your name"
- "आपको गिरफ्तार किया जाएगा" (You will be arrested)
- "account freeze ho jayega"

### 5. 🟡 Payment
**What it detects**: Requests for money, OTPs, or financial credentials
**Examples**:
- "Share the OTP you received"
- "इस खाते में पैसे भेजें" (Send money to this account)
- "apna UPI PIN batao"

---

## 10. Data Flow — End to End

Here is the complete data flow when a user starts a Whisper ASR call:

### Step 1: Audio Capture
```
Microphone → getUserMedia → AudioContext → ScriptProcessorNode
→ onaudioprocess callback fires every ~93ms with raw PCM data
```

### Step 2: Audio Processing (in useWhisperASR.js)
```
Raw PCM (44.1kHz) → Nearest-neighbor downsample → 16kHz Float32Array
→ Amplitude normalization (divide by max absolute value)
→ Accumulate until 2.5 seconds of audio (40,000 samples)
→ Send chunk to Whisper Worker via postMessage (transferable ArrayBuffer)
```

### Step 3: Speech-to-Text (in whisper.worker.js)
```
Float32Array chunk → Whisper pipeline (automatic-speech-recognition)
→ Transcribed text → postMessage back to main thread
→ Accumulated into rolling transcript (max 300 words)
```

### Step 4: Scam Classification (in classifier.worker.js)
```
Transcript text → splitSentences() → 2-pass sentence splitter
→ embed(sentences) → one forward pass through multilingual-e5-small
→ For each sentence × signal: cosine similarity against exemplar vectors
→ Per-signal thresholds → detected signals with confidence + evidence
→ postMessage back to main thread
```

### Step 5: Local Risk Scoring (in App.jsx)
```
Detected signals → scoreRisk(signals, elapsedSeconds)
→ Base weights + escalation rule bonuses → clamped 0-100
→ Map to action: monitor / warn / block
→ Update Zustand store → Update XState FSM
```

### Step 6: Tier-2 Streaming (via Socket.IO)
```
Frontend emits 'analyze_stream' with:
  { sessionId, transcriptWindow, lang, signals, elapsedSeconds }

Backend LangGraph streams:
  pipeline_start → { nodes: ['classify','retrieve','reason','score'] }
  node_update → { node: 'classify', update: { signals: [...] }, t: 13 }
  node_update → { node: 'retrieve', update: { advisories: [...] }, t: 25 }
  node_update → { node: 'reason', update: { alertText: {...} }, t: 186 }
  node_update → { node: 'score', update: { riskScore: 100, action: 'block' }, t: 192 }
  pipeline_complete → { riskScore, action, signals, alertText, advisories, elapsedMs }
```

### Step 7: UI Update
```
Zustand store updates → React re-renders:
  - PipelineViz: nodes light up with real latencies
  - SignalPanel: signals appear with colored evidence phrases
  - RiskMeter: score animates to new value
  - LiveTranscript: evidence phrases highlighted in signal colors
  - ScamAlertOverlay: appears on warn/block with TTS
```

---

## 11. File-by-File Breakdown

### Frontend (`frontend/src/`)

| File | Lines | Purpose |
|---|---|---|
| `App.jsx` | ~550 | Main application — socket connection, worker management, layout |
| `main.jsx` | 10 | React entry point |
| `index.css` | ~100 | Global styles + Tailwind directives |
| **Components** | | |
| `CallSimulator.jsx` | 405 | 3-mode call input (script/live/whisper) |
| `PipelineViz.jsx` | 115 | Live agentic pipeline visualization |
| `SignalPanel.jsx` | 79 | Real-time signal detection panel |
| `RiskMeter.jsx` | ~120 | Visual risk score gauge |
| `LiveTranscript.jsx` | ~120 | Highlighted rolling transcript |
| `ScamAlertOverlay.jsx` | ~200 | Full-screen scam alert with TTS |
| `ModelLoadingScreen.jsx` | ~100 | First-load progress screen |
| `SafeWordSetup.jsx` | ~180 | Emergency contact config |
| `OfflineModePanel.jsx` | ~140 | Offline WebLLM mode toggle |
| `LanguageToggle.jsx` | ~30 | EN/HI language switcher |
| **Workers** | | |
| `classifier.worker.js` | ~100 | Tier-1 embedding classifier |
| `whisper.worker.js` | ~80 | On-device Whisper ASR |
| `llm.worker.js` | ~160 | On-device WebLLM reasoning |
| `voiceClone.worker.js` | ~160 | Voice clone detection |
| **Hooks** | | |
| `useWhisperASR.js` | 222 | Mic → Whisper pipeline |
| `useSpeechRecognition.js` | 85 | Browser Web Speech API wrapper |
| **State** | | |
| `callMachine.js` | 64 | XState v5 call FSM |
| `useRakshaStore.js` | 106 | Zustand global store |
| **Libraries** | | |
| `embeddingClassifier.js` | 119 | Sentence embedding + cosine classifier |
| `signalMeta.js` | 61 | Signal display metadata |
| **Data** | | |
| `signal_exemplars.json` | 102 | Multilingual exemplar phrases + thresholds |

### Backend (`backend/src/`)

| File | Lines | Purpose |
|---|---|---|
| `server.js` | 121 | Express + Socket.IO entry point |
| `config.js` | ~40 | Environment configuration loader |
| **Agent** | | |
| `graph.js` | 152 | LangGraph state machine (the orchestrator) |
| `classifier.js` | ~90 | Server-side signal classifier |
| `retriever.js` | 144 | RAG retriever (semantic + lexical fallback) |
| `reasoner.js` | ~100 | Gemini LLM reasoning |
| `riskScorer.js` | 99 | Deterministic risk scorer |
| `riskScorer.test.js` | ~100 | Unit tests for the scorer |

### Root

| File | Purpose |
|---|---|
| `docker-compose.yml` | Local multi-container orchestration |
| `ARCHITECTURE.md` | Detailed architecture documentation |
| `scam_taxonomy.json` | Signal weights, thresholds, escalation rules |
| `sample_advisories.json` | Knowledge base of Indian scam advisories |

---

## 12. Deployment Architecture

### Frontend → Vercel
```
GitHub Push → Vercel Auto-Build → Vite Build → Static Files Served
```
- `vercel.json` configures SPA routing (all paths → `index.html`)
- Environment variable: `VITE_WS_URL=https://your-backend.onrender.com`

### Backend → Render (or Railway / Fly.io)
```
GitHub Push → Render Auto-Build → Dockerfile → Node.js Container
```
- `Dockerfile` uses `node:22-slim`, installs production deps, exposes port 4000
- Environment variables: `GEMINI_API_KEY`, `PORT`, `CORS_ORIGINS`

### Docker Compose (Local Testing)
```bash
docker-compose up --build
# Backend: http://localhost:4000
# Frontend: http://localhost:5174
```

---

## 13. How to Run Locally

### Prerequisites
- Node.js 22+
- npm 9+
- A modern browser with WebGPU support (Chrome 113+, Edge 113+)

### Quick Start
```bash
# Clone the repository
git clone https://github.com/Ankit-blip737/hackathon-project.git
cd hackathon-project

# Backend
cd backend
cp .env.example .env     # Add your GEMINI_API_KEY if you have one
npm install
npm start                # Starts on http://localhost:4000

# Frontend (in a new terminal)
cd frontend
npm install
npm run dev              # Starts on http://localhost:5173
```

### First Load
1. Open http://localhost:5173 in Chrome
2. Wait for the loading screen ("Arming your on-device shield") — the ML model downloads once (~235 MB) and is cached by the browser
3. The device badge shows ⚡WEBGPU or 🧩WASM
4. Select "Whisper ASR" mode and click "Start Whisper ASR"
5. Speak into your microphone — scam signals appear in real-time

---

## 14. Phase-wise Development History

### Phase 0 — Truth & Foundation
**Goal**: Make every claim in the UI literally true.

| Task | What Changed |
|---|---|
| Env config + CORS | `VITE_WS_URL`, `VITE_API_BASE`, `CORS_ORIGINS` — all configurable |
| @huggingface/transformers v3 | Replaced v2 (WASM-only) with v3 (real WebGPU support) |
| Honest device badge | Shows ⚡WEBGPU or 🧩WASM based on actual runtime |
| First-load UX | Full-screen progress screen instead of header text |

### Phase 1 — Multilingual Tier-1 That Works
**Goal**: Make Hindi/Hinglish scam detection actually functional.

| Task | What Changed |
|---|---|
| Model swap | MobileBERT (English NLI) → multilingual-e5-small (100+ languages) |
| Algorithm change | Zero-shot NLI (5 passes) → Embedding prototype matching (1 pass) |
| Exemplar data | Created 70+ phrases in EN/HI/Hinglish across 5 signals |
| Per-signal thresholds | Tuned against demo scripts (authority=0.75, urgency=0.63, etc.) |
| Validation harness | Node.js script runs the real model against all 3 demo transcripts |

**Measured results:**
| Demo | Old Model | New Model |
|---|---|---|
| Hindi Digital Arrest | 0/5 signals (can't read Hindi) | 5/5 → block |
| English KYC | Partial detection | 4/5 → block |
| Benign (with trap phrases) | False positived | 0/5 → stays green ✓ |

### Phase 2 — Unified Pipeline
**Goal**: One pipeline, two transports, no tech debt.

| Task | What Changed |
|---|---|
| LangGraph | Single StateGraph replaces fragmented code paths |
| Streaming | `.stream()` over WebSocket with node-by-node events |
| Graceful RAG | Lexical fallback when no Gemini key — system works offline |
| Zustand | Replaced useState/useRef soup with a single store |
| XState | Deterministic FSM for call lifecycle (warn ≠ block fix) |

### Phase 3 — Wow Factor UI
**Goal**: Visualize the AI's reasoning in real-time.

| Task | What Changed |
|---|---|
| Pipeline Viz | Live agentic pipeline card driven by real graph events |
| Signal Panel | Real-time signal detection with colored evidence |
| Transcript Highlighting | Evidence phrases marked in signal colors |
| Call Timer | Live elapsed time display |

### Phase 4 — SOTA Upgrades
**Goal**: On-device ASR, offline LLM, containerization.

| Task | What Changed |
|---|---|
| Whisper ASR | On-device speech recognition (audio never leaves browser) |
| Audio normalization | Prevents Whisper from rejecting low-volume input |
| 2.5s chunks | Faster response time (was 5s) |
| WebLLM | Qwen2.5-1.5B for fully offline reasoning |
| Voice clone wiring | Raw PCM dispatch to voiceClone worker |
| Dockerization | Dockerfiles for both services + docker-compose + vercel.json |
| Degeneracy fix | fp16 on WebGPU + runtime self-check |

---

## 15. Hackathon Pitch Guide

### The 3-Minute Pitch Structure

**Slide 1 — The Problem (30 seconds)**
- "India lost ₹1,750 crore to phone scams in 2024"
- "Digital Arrest scams target everyone — students, elderly, professionals"
- "Existing solutions send your private calls to the cloud"

**Slide 2 — The Solution (30 seconds)**
- "Raksha is a real-time scam shield that runs entirely in your browser"
- "It listens, understands Hindi/English/Hinglish, and alerts you instantly"
- "Zero cloud. Your audio never leaves your device."

**Slide 3 — Live Demo (90 seconds)**
1. Show the loading screen → point out the ⚡WEBGPU badge
2. Run the Hindi Digital Arrest script
3. Watch signals light up in real-time (point out Hindi evidence phrases)
4. Show the Agentic Pipeline visualization with real latencies
5. Show the alert overlay with evidence and confidence scores
6. **The "Pull the Plug" Moment**: Turn off Wi-Fi → show Tier-1 still works

**Slide 4 — Architecture (15 seconds)**
- Show the 2-tier diagram
- "Tier-1 is fully on-device. Tier-2 enhances with knowledge base and reasoning."

**Slide 5 — Impact (15 seconds)**
- "Works in Hindi, English, and Hinglish — built for Bharat"
- "One-time 235MB download, then it's cached forever"
- "Can be integrated into any calling app as a module"

### Judge Q&A Preparation

| Likely Question | Your Answer |
|---|---|
| "Does audio really never leave the browser?" | "Correct. Whisper ASR runs via Transformers.js v3 on WebGPU. The raw PCM is processed in a Web Worker. We can prove it — turn off the network and it still transcribes." |
| "What about the Web Speech API?" | "We kept it as a comparison mode labeled 'Live Mic'. Our recommended mode is Whisper ASR which is fully on-device. The label honestly says which mode is which." |
| "How does it handle Hindi?" | "We use multilingual-e5-small which supports 100+ languages. Our exemplar set has phrases in Devanagari Hindi, Romanized Hinglish, and English. We validated it — 5/5 signals on a real Hindi scam script." |
| "Is the pipeline visualization real?" | "Yes — it's driven by LangGraph.stream() events over WebSocket. Each node lighting up corresponds to an actual function completing. The latencies shown are real measurements." |
| "What about false positives?" | "We tuned per-signal thresholds against a benign call that deliberately includes scam-adjacent words like 'warrant', 'arrest', and 'freeze account' in movie-plot context. It stays green. The scoring engine is deterministic and unit-tested." |
| "Can this work on a phone?" | "The browser version runs on any WebGPU-capable mobile browser. For native Android, we've researched MuRIL + IndicWhisper for on-device inference. The same architecture applies." |

---

## 16. Future Roadmap

| Feature | Priority | Description |
|---|---|---|
| Voice Clone Detection | High | AASIST/RawNet2-style anti-spoofing model for AI-generated voices |
| MuRIL Fine-tuning | High | Indian-language BERT fine-tuned on synthetic Hinglish scam data |
| PWA Install | Medium | Progressive Web App for one-tap installation |
| 1930 NCRP Integration | Medium | Pre-filled cybercrime report with transcript + signals |
| Session Replay | Medium | Time-travel through past calls using LangGraph checkpointer |
| Modus Operandi Matching | Low | Named scam script matching ("This is a Digital Arrest playbook") |
| Regional Languages | Low | Tamil, Telugu, Bengali, etc. using the same multilingual embedder |

---

> **Built with ❤️ for Bharat** — Raksha aims to protect every Indian citizen from the growing threat of AI-powered financial scams, using the same AI technology to defend rather than attack.
