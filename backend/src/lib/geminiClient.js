/**
 * geminiClient.js
 * Single shared @google/generative-ai client instance.
 * All agent/* modules import from here — no other file instantiates its own client.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from '../config.js'

export const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY)

/**
 * Get a generative model instance.
 * @param {string} modelName
 * @param {object} [generationConfig]
 */
export function getModel(modelName, generationConfig = {}) {
  return genAI.getGenerativeModel({ model: modelName, generationConfig })
}
