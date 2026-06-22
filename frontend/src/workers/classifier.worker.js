import { pipeline, env } from '@xenova/transformers';

// Skip local model checks since we are running in the browser
env.allowLocalModels = false;

// We use a small, fast model for browser-local inference
const MODEL_NAME = 'Xenova/mobilebert-uncased-mnli';

const LABEL_MAP = {
  "an urgent situation": "urgency",
  "a police or authority figure": "authority",
  "keeping something secret": "secrecy",
  "a threat of arrest or harm": "threat",
  "a request for payment or money": "payment"
};
const CANDIDATE_LABELS = Object.keys(LABEL_MAP);

class ClassifierPipeline {
  static task = 'zero-shot-classification';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, MODEL_NAME, { progress_callback });
    }
    return this.instance;
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  const { id, text, type } = event.data;

  if (type === 'init') {
    try {
      // Pre-load the model
      await ClassifierPipeline.getInstance(x => {
        self.postMessage({ type: 'progress', data: x });
      });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
    return;
  }

  if (type === 'classify') {
    try {
      const classifier = await ClassifierPipeline.getInstance();
      
      // We process sentence by sentence
      const sentences = text.match(/[^.!?।]+[.!?।]*/g)?.map(s => s.trim()).filter(s => s.length > 5) || [text];
      
      const detectedSignals = new Map();

      for (const sentence of sentences) {
        const result = await classifier(sentence, CANDIDATE_LABELS, { multi_label: true });
        
        for (let i = 0; i < result.labels.length; i++) {
          const score = result.scores[i];
          if (score > 0.6) {
            const taxonomyId = LABEL_MAP[result.labels[i]];
            if (!detectedSignals.has(taxonomyId) || detectedSignals.get(taxonomyId).confidence < score) {
              detectedSignals.set(taxonomyId, {
                id: taxonomyId,
                evidencePhrase: sentence,
                confidence: Number(score.toFixed(2))
              });
            }
          }
        }
      }

      self.postMessage({
        type: 'result',
        id,
        signals: Array.from(detectedSignals.values())
      });
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message });
    }
  }
});
