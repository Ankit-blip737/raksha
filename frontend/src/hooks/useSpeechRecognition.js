/**
 * useSpeechRecognition.js
 * Wraps the browser Web Speech API (continuous, interimResults).

 */
import { useState, useRef, useCallback, useEffect } from 'react'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

export function useSpeechRecognition(lang = 'en-IN') {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(() => !!SpeechRecognition)
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')

  useEffect(() => {

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      }
    }
  }, [])

  const start = useCallback(() => {
    if (!isSupported) return
    
    // Clean up old instance
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.abort()
    }

    finalTranscriptRef.current = ''
    setTranscript('')

    setIsListening(true)

    const startNewSession = () => {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = lang

      let sessionFinalStr = ''

      recognition.onresult = (event) => {
        let currentFinal = ''
        let currentInterim = ''
        
        for (let i = 0; i < event.results.length; i++) {
          const text = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            currentFinal += text + ' '
          } else {
            currentInterim += text
          }
        }
        
        sessionFinalStr = currentFinal
        setTranscript(finalTranscriptRef.current + currentFinal + currentInterim)
      }

      recognition.onerror = (e) => {
        console.warn('SpeechRecognition error:', e.error)
        if (e.error === 'not-allowed') {
          setIsListening(false)
        }
      }

      recognition.onend = () => {
        finalTranscriptRef.current += sessionFinalStr
        
        // Check if we should auto-restart
        if (recognitionRef.current === recognition) {
          try {
            startNewSession()
          } catch (e) {
            setIsListening(false)
          }
        }
      }

      recognitionRef.current = recognition
      try {
        recognition.start()
      } catch (e) {
        console.warn(e)
      }
    }

    startNewSession()
  }, [isSupported, lang])

  const stop = useCallback(() => {
    setIsListening(false)
    if (recognitionRef.current) {
      const rec = recognitionRef.current
      recognitionRef.current = null // Prevent auto-restart
      rec.stop()
    }
  }, [])

  const reset = useCallback(() => {
    finalTranscriptRef.current = ''
    setTranscript('')
  }, [])

  return { transcript, isListening, isSupported, start, stop, reset }
}
