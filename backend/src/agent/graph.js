/**
 * graph.js — LangGraph.js Orchestrator
 * Wires: START → {classify, retrieve} (parallel fan-out) → reason → score → END
 * State carries all data between nodes; each node writes only its own keys.
 *
 * This is what makes Raksha legitimately "agentic" per ARCHITECTURE.md §5 —
 * not just a chain of function calls, but a state-graph with parallel branches.
 */
import { StateGraph, START, END } from '@langchain/langgraph'
import { classifySignals } from './classifier.js'
import { retrieveAdvisories } from './retriever.js'
import { reasonAboutCall } from './reasoner.js'
import { scoreRisk } from './riskScorer.js'

// Graph state shape — each node reads what it needs and writes only its own keys
const graphState = {
  // Inputs (set by caller)
  transcriptWindow: { value: (a, b) => b ?? a },
  lang: { value: (a, b) => b ?? a },
  elapsedSeconds: { value: (a, b) => b ?? a },
  // Node outputs
  signals: { value: (a, b) => b ?? a ?? [] },
  advisories: { value: (a, b) => b ?? a ?? [] },
  alertText: { value: (a, b) => b ?? a ?? {} },
  riskScore: { value: (a, b) => b ?? a ?? 0 },
  action: { value: (a, b) => b ?? a ?? 'monitor' },
}

// Node 1: Signal Classifier — runs in parallel with Node 2
async function classifyNode(state) {
  const signals = await classifySignals(state.transcriptWindow, state.lang)
  return { signals }
}

// Node 2: Knowledge Retriever — runs in parallel with Node 1
async function retrieveNode(state) {
  const advisories = await retrieveAdvisories(state.transcriptWindow, 3)
  return { advisories }
}

// Node 3: LLM Reasoner — receives merged state from both parallel branches
async function reasonNode(state) {
  const { signals, alertText } = await reasonAboutCall({
    transcriptWindow: state.transcriptWindow,
    lang: state.lang,
    signals: state.signals,
    advisories: state.advisories,
  })
  return { signals, alertText }
}

// Node 4: Deterministic Risk Scorer — no LLM, pure rules
async function scoreNode(state) {
  const { riskScore, action } = scoreRisk(state.signals, state.elapsedSeconds)
  return { riskScore, action }
}

// Build the graph
const workflow = new StateGraph({ channels: graphState })
  .addNode('classify', classifyNode)
  .addNode('retrieve', retrieveNode)
  .addNode('reason', reasonNode)
  .addNode('score', scoreNode)
  // Fan-out: START → classify AND retrieve (parallel)
  .addEdge(START, 'classify')
  .addEdge(START, 'retrieve')
  // Fan-in: both → reason
  .addEdge('classify', 'reason')
  .addEdge('retrieve', 'reason')
  // Linear: reason → score → END
  .addEdge('reason', 'score')
  .addEdge('score', END)

const compiledGraph = workflow.compile()

/**
 * @param {{ transcriptWindow:string, lang:string, elapsedSeconds:number }} input
 * @returns {Promise<{ signals, advisories, alertText, riskScore, action }>}
 */
export async function runRakshaGraph(input) {
  const finalState = await compiledGraph.invoke({
    transcriptWindow: input.transcriptWindow,
    lang: input.lang,
    elapsedSeconds: input.elapsedSeconds ?? 0,
    signals: [],
    advisories: [],
    alertText: {},
    riskScore: 0,
    action: 'monitor',
  })
  return finalState
}
