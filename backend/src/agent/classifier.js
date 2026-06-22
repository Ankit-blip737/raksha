/**
 * classifier.js — Node 1: Signal Classifier
 * Uses @xenova/transformers (zero-shot classification) locally.
 * Lightning-fast, on-device classification without generating text.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pipeline, env } from '@xenova/transformers'

// Ensure transformers doesn't try to use the browser cache
env.cacheDir = './.cache'

const __dirname = dirname(fileURLToPath(import.meta.url))
function findDataFile(filename) {
  const candidates = [
    resolve(__dirname, '../../../../data', filename),
    resolve(__dirname, '../../../data', filename),
    resolve(process.cwd(), 'data', filename),
    resolve(process.cwd(), '../data', filename),
  ]
  for (const p of candidates) {
    try { readFileSync(p); return p } catch {}
  }
  throw new Error(`[Classifier] Cannot find ${filename}.`)
}

const taxonomy = JSON.parse(readFileSync(findDataFile('scam_taxonomy.json'), 'utf-8'))
const VALID_IDS = new Set(taxonomy.signals.map(s => s.id))

// We map natural language concepts to our taxonomy IDs
// English labels work well even for Hindi text because the model is cross-lingual
const LABEL_MAP = {
  "an urgent situation": "urgency",
  "a police or authority figure": "authority",
  "keeping something secret": "secrecy",
  "a threat of arrest or harm": "threat",
  "a request for payment or money": "payment"
}
const CANDIDATE_LABELS = Object.keys(LABEL_MAP)

let classifierInstance = null
async function getClassifier() {
  if (!classifierInstance) {
    console.log('[Classifier] Loading local zero-shot model (bert-base-multilingual-cased-finetuned-xnli)...')
    // Multilingual model supports both English and Hindi
    classifierInstance = await pipeline('zero-shot-classification', 'Xenova/bert-base-multilingual-cased-finetuned-xnli')
    console.log('[Classifier] Local model loaded.')
  }
  return classifierInstance
}

function extractSentences(text) {
  return text.match(/[^.!?।]+[.!?।]*/g)?.map(s => s.trim()).filter(s => s.length > 5) || [text]
}

export async function classifySignals(transcriptWindow, lang) {
  try {
    const classifier = await getClassifier()
    const sentences = extractSentences(transcriptWindow)
    
    const detectedSignals = new Map()

    for (const sentence of sentences) {
      // Run zero-shot classification on the sentence
      const result = await classifier(sentence, CANDIDATE_LABELS, { multi_label: true })
      
      // Check which labels scored above threshold (e.g. 0.85 to reduce false positives)
      for (let i = 0; i < result.labels.length; i++) {
        const score = result.scores[i]
        if (score > 0.85) {
          const taxonomyId = LABEL_MAP[result.labels[i]]
          
          // Keep the one with the highest confidence if seen multiple times
          if (!detectedSignals.has(taxonomyId) || detectedSignals.get(taxonomyId).confidence < score) {
            detectedSignals.set(taxonomyId, {
              id: taxonomyId,
              evidencePhrase: sentence,
              confidence: Number(score.toFixed(2))
            })
          }
        }
      }
    }

    return Array.from(detectedSignals.values())
  } catch (err) {
    console.error('[Classifier] Local classification failed:', err.message)
    return [] // Never crash the pipeline
  }
}
