/**
 * config.js
 * Loads environment variables for Gemini.
 */
import 'dotenv/config'

if (!process.env.GEMINI_API_KEY) {
  console.warn('[WARNING] GEMINI_API_KEY is not set in environment.')
}

export const config = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  CLASSIFIER_MODEL: process.env.CLASSIFIER_MODEL ?? 'gemini-2.5-flash',
  REASONER_MODEL: process.env.REASONER_MODEL ?? 'gemini-2.5-pro',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? 'text-embedding-004',
}
