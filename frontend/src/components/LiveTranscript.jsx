/**
 * LiveTranscript.jsx
 * Scrolling transcript pane. Shows "Raksha is listening" indicator.
 * Privacy: nothing is persisted — the note reinforces this for users.
 */
import React, { useEffect, useRef } from 'react'

const UI = {
  title: { en: 'Live Transcript', hi: 'लाइव ट्रांसक्रिप्ट' },
  listening: { en: 'Raksha is listening', hi: 'राक्षा सुन रही है' },
  idle: { en: 'Start a call to see the transcript', hi: 'ट्रांसक्रिप्ट देखने के लिए कॉल शुरू करें' },
  privacy: { en: 'Nothing is recorded or stored — transcript lives only in this session.', hi: 'कुछ भी रिकॉर्ड या स्टोर नहीं होता — ट्रांसक्रिप्ट केवल इस सत्र में है।' },
}

export default function LiveTranscript({ transcript, lang, isActive }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  return (
    <div className="card-framer flex flex-col h-72">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[18px] font-bold text-white heading-framer flex items-center gap-3">
          <span className="text-white/60">🎙</span>
          {UI.title[lang]}
        </h2>
        {isActive && (
          <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 tracking-widest uppercase bg-emerald-500/10 px-3 py-1 rounded-full">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            {UI.listening[lang]}
          </span>
        )}
      </div>

      {/* Transcript body */}
      <div className="flex-1 overflow-y-auto rounded-[20px] bg-white/5 border border-white/5 p-6 shadow-inner relative">
        {transcript ? (
          <p className="text-[14px] text-white/80 leading-relaxed whitespace-pre-wrap font-medium">
            {transcript}
            {isActive && <span className="inline-block w-1.5 h-4 bg-white/80 ml-1 animate-pulse align-middle"></span>}
          </p>
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-40">
            <span className="text-2xl mb-3 text-white">💬</span>
            <p className="text-[11px] text-white font-bold tracking-widest uppercase text-center">
              {UI.idle[lang]}
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Privacy note */}
      <div className="mt-5 flex items-center justify-center">
        <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold flex items-center gap-2">
          <span className="text-white/60">🔒</span> {UI.privacy[lang]}
        </span>
      </div>
    </div>
  )
}
