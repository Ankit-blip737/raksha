# Raksha: Phase 4 On-Device Model Architecture

To achieve the ultimate goal of zero-latency, absolute privacy, and offline capability, Raksha's architecture is designed to transition from cloud-based APIs (Gemini) to fully on-device Small Language Models (SLMs) running locally on Android smartphones. 

This document outlines the optimal tiny models available today for deploying Raksha directly to edge devices.

---

## Why On-Device AI?

1. **Absolute Privacy:** Audio and call transcripts never leave the user's phone. This is critical for regulatory compliance and user trust.
2. **Zero Latency:** No network round-trips. Analyzing a rolling transcript window happens in milliseconds.
3. **Offline Protection:** Scammers often target users in low-connectivity areas or convince them to turn off Wi-Fi/Data. On-device models work regardless of the network state.

---

## The Two-Tier AI Pipeline

Running large models continuously during a phone call will drain the battery and overheat the device. Therefore, Raksha uses a two-tier approach:

* **Tier 1: The Fast Classifier** — A tiny, ultra-efficient model that runs every 3 seconds to scan the transcript for the 5 scam signals (Urgency, Authority, Secrecy, Threat, Payment).
* **Tier 2: The LLM Reasoner** — A slightly larger, generative model that ONLY wakes up if Tier 1 flags a potential scam. It validates the context and drafts the final alert.

---

## Top Tiny LLMs for Phones (Tier 2: Reasoner)

These are the best generative models (1B to 3B parameters) that can be quantized to 4-bit (INT4) and run locally via **TensorFlow Lite**, **MediaPipe**, or **ExecuTorch** on modern Android processors (Snapdragon / MediaTek) with 4GB+ RAM.

### 1. Gemma-2B / 2B-IT (Google)
* **Parameters:** 2 Billion
* **Why it's great:** Built on the same research as Gemini. It is heavily optimized for edge devices, natively supported by Google's MediaPipe LLM Inference API, and offers exceptional reasoning for its size.
* **Best for:** The default Android ecosystem standard.

### 2. Sarvam-1 (Sarvam AI)
* **Parameters:** 2 Billion
* **Why it's great:** A model purpose-built for India. It features a highly efficient tokenizer for Indic scripts, meaning it processes Hindi and regional languages much faster and with fewer tokens than Western models.
* **Best for:** The ultimate localized experience for the Indian market.

### 3. Llama 3.2 (1B and 3B) (Meta)
* **Parameters:** 1 Billion / 3 Billion
* **Why it's great:** Meta's newest lightweight models specifically designed for mobile devices. They feature massive context windows (128k) and were built from the ground up for edge deployments on Qualcomm and MediaTek hardware.
* **Best for:** Devices with limited RAM (the 1B version is incredibly light).

### 4. Qwen2.5 (0.5B and 1.5B) (Alibaba)
* **Parameters:** 0.5 Billion / 1.5 Billion
* **Why it's great:** One of the most powerful model families in the sub-2B category. The 0.5B model is astonishingly small (takes less than 500MB of RAM when quantized) yet capable of strict JSON formatting and reasoning.
* **Best for:** Lower-end smartphones where memory constraints are severe.

### 5. Phi-3 Mini (Microsoft)
* **Parameters:** 3.8 Billion
* **Why it's great:** Trained on "textbook-quality" data, it punches way above its weight class in logical reasoning.
* **Best for:** High-end phones where you need maximum reasoning capabilities to prevent false positives.

---

## Top Tiny Models for Classification (Tier 1: Fast Scanner)

Instead of using a generative LLM for the constant scanning, we use **Encoder-only** models. These models don't generate text; they simply output probabilities, making them lightning-fast and battery-friendly.

### 1. IndicBERT (AI4Bharat) / MuRIL (Google)
* **Why they are great:** Pre-trained on dozens of Indian languages. They can be fine-tuned specifically on scam datasets to recognize intent (e.g., "threat" or "payment request") in a fraction of a second.
* **Footprint:** Typically under 100MB when optimized.

### 2. MobileBERT
* **Why it's great:** A compressed version of BERT designed explicitly for mobile APIs. Extremely fast execution on mobile CPUs.

---

## On-Device Audio & RAG Stack

To complete the on-device architecture without relying on the cloud:

* **On-Device ASR (Speech-to-Text):** **IndicWhisper (AI4Bharat)** converted to ONNX or TFLite format. It accurately handles Indian accents and Hinglish locally.
* **On-Device RAG (Vector Database):** **FAISS (Meta)** compiled for Android via JNI, or **SQLite with vector extensions (sqlite-vec)**. This allows the app to query thousands of 1930 Cybercrime advisories locally on the device.
* **On-Device TTS (Text-to-Speech):** Android's native `TextToSpeech` engine, augmented with AI4Bharat's **IndicTTS** for natural-sounding regional alerts.

---

## Deployment Strategy (Quantization)

To make these models fit on a phone, they undergo **Quantization** (reducing the precision of the model's weights from 16-bit floats to 4-bit or 8-bit integers). 

* A 2B parameter model like Gemma-2B usually requires ~4GB of space. 
* With **4-bit quantization (INT4)**, the footprint shrinks to roughly **1.2GB**, easily fitting into the RAM of standard Android phones while maintaining ~95% of its original accuracy.
