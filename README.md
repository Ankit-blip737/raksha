# Raksha — Real-Time AI Scam Shield (Web Demo)

> **Detects the scam pattern in a conversation, not the voice.**
> An AI-powered, bilingual (Hindi + English) scam detection demo that analyzes live phone call transcripts in real time and alerts users to digital-arrest, KYC, OTP, and other common Indian scam patterns.

---

## What This Is

This is a **Phase-2 web demo** of the Raksha concept — a faithful proof of the detection pipeline described in the pitch deck. See the collapsible **DEMO** badge in the UI for exactly what's simulated vs. what's real.

| What's in this build | What it replaces (Phase 4) |
|---|---|
| Browser Web Speech API (ASR) | IndicWhisper ONNX on-device |
| Gemini cloud API (classifier + reasoner) | Fine-tuned IndicBERT + Sarvam-1 on-device |
| In-memory cosine similarity RAG | FAISS on-device index |
| `speechSynthesis` TTS | AI4Bharat IndicTTS |
| No real 1930 submission | Live I4C/1930 Helpline API |

---

## Setup & Run

### Prerequisites
- Node.js 18+
- A valid [Gemini API key](https://aistudio.google.com/app/apikey)

### 1. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure backend

```bash
cd backend
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
```

### 3. Start the backend

```bash
cd backend
npm start
# Watch for: "[Raksha] Knowledge base ready — accepting requests."
```

### 4. Start the frontend (new terminal)

```bash
cd frontend
npm run dev
# Open http://localhost:5173
```

---

## Demo Scripts (3 Scenarios)

### 1. 🚨 Digital Arrest Scam (Hindi)
Select **"Digital Arrest Scam (Hindi)"** in the simulator. A caller claims to be from the CBI, references a suspicious parcel, threatens arrest, and demands money transfer. **Should trigger `block` by ~40 seconds.**

*What to say while demoing: "Notice the risk meter climb as the scammer establishes authority, creates urgency, then demands payment. This is the classic digital-arrest playbook. Raksha catches all five signals."*

### 2. ⚠ Bank KYC / OTP Scam (English)
Select **"Bank KYC / OTP Scam (English)"**. A fake bank fraud department representative pressures for KYC re-verification and demands an OTP. **Should trigger `warn` then `block`.**

*What to say: "This is the most common scam type. The moment the caller asks for an OTP, the risk jumps — Raksha is trained on exactly this pattern from the I4C/1930 advisory corpus."*

### 3. ✅ Benign Call — False Positive Check (English)
Select **"Benign Call"**. A normal conversation that mentions "bank", "urgent", and "arrest" in innocuous contexts. **Should stay at `monitor` throughout — no alert fires.**

*What to say: "This is our false-positive check. Raksha's LLM reasoner catches that 'warrant' is being used in a movie-plot context, not a real threat. A system that cries wolf on every call would be useless — this matters as much as the scam demos."*

---

## Running Unit Tests

```bash
cd backend
node --test src/agent/riskScorer.test.js
```

---

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full technical specification.

**Key design decision:** The risk scorer is deterministic code (not an LLM) — making the highest-stakes warn/block decision auditable and immune to LLM non-determinism.
