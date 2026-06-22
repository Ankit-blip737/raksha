/**
 * retriever.js — Node 2: Knowledge Retriever (RAG)
 * Embeds advisories at startup using Ollama, then searches them via cosine similarity.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { genAI } from '../lib/geminiClient.js'
import { config } from '../config.js'

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
  throw new Error(`[Retriever] Cannot find ${filename}.`)
}

// In-memory vector store for demo
const vectorStore = []
let isInitialized = false

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function getEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: config.EMBEDDING_MODEL })
  const result = await model.embedContent(text)
  return result.embedding.values
}

export async function initRetriever() {
  if (isInitialized) return

  const advisories = JSON.parse(readFileSync(findDataFile('sample_advisories.json'), 'utf-8'))
  console.log(`[Retriever] Embedding ${advisories.length} advisories using ${config.EMBEDDING_MODEL}...`)

  for (const adv of advisories) {
    const textToEmbed = `Title: ${adv.title.en}\nSummary: ${adv.summary.en}`
    const embedding = await getEmbedding(textToEmbed)
    vectorStore.push({ ...adv, embedding })
  }

  isInitialized = true
  console.log('[Retriever] Knowledge base ready.')
}

export async function retrieveAdvisories(queryText, topK = 1) {
  if (!isInitialized) await initRetriever()
  if (!queryText || queryText.trim().length === 0) return []

  try {
    const queryEmbedding = await getEmbedding(queryText)

    const scored = vectorStore.map(adv => ({
      ...adv,
      relevance: cosineSimilarity(queryEmbedding, adv.embedding),
    }))

    scored.sort((a, b) => b.relevance - a.relevance)
    return scored.slice(0, topK)
  } catch (err) {
    console.error('[Retriever] Embedding failed, returning empty:', err.message)
    return []
  }
}
