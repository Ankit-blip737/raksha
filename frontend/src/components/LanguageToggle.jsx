/**
 * LanguageToggle.jsx
 * hi / en switch. All language strings come from {en, hi} objects — no if(lang==='hi') branches.
 */
import React from 'react'

const LABELS = {
  en: { en: 'English', hi: 'अंग्रेज़ी' },
  hi: { en: 'Hindi', hi: 'हिन्दी' },
}

export default function LanguageToggle({ lang, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1 border border-gray-700">
      {['en', 'hi'].map((l) => (
        <button
          key={l}
          id={`lang-toggle-${l}`}
          onClick={() => onChange(l)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
            lang === l
              ? 'bg-raksha-accent text-white shadow'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {LABELS[l][lang]}
        </button>
      ))}
    </div>
  )
}
