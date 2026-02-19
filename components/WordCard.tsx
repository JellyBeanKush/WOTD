
import React from 'react';
import { WordData } from '../types';
import { Volume2, Loader2, AlertCircle } from 'lucide-react';

interface WordCardProps {
  data: WordData;
  isOverlayMode: boolean;
  onOpenSettings: () => void;
  isPlaying: boolean;
  onPlayAudio: () => void;
  hasError?: boolean;
}

export const WordCard: React.FC<WordCardProps> = ({ 
  data, 
  isOverlayMode, 
  onOpenSettings,
  isPlaying,
  onPlayAudio,
  hasError = false
}) => {
  // Helper to ensure clean display (strips old IPA slashes if they exist in legacy data)
  const cleanPhonetic = data.phonetic.replace(/^\/|\/$/g, '');

  return (
    <div className={`relative w-full max-w-xl mx-auto transition-all duration-500 ease-in-out fade-in
      ${isOverlayMode 
        ? 'bg-zinc-900 border border-zinc-700' 
        : 'bg-zinc-900 border border-zinc-800 shadow-2xl shadow-twitch-base/10'} 
      rounded-2xl overflow-hidden`}
    >
      {/* Card Content Wrapper */}
      <div className="p-8 flex flex-col gap-6">
        
        {/* Header Section: Badge + Date */}
        <div className="flex items-center justify-between">
          <span className="bg-twitch-base text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
            Word of the Day
          </span>
          <span className="text-zinc-500 text-xs font-mono">
            {data.generatedDate}
          </span>
        </div>

        {/* Word & Pronunciation Group */}
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-5xl font-extrabold text-white tracking-tight leading-none">
                {data.word}
                </h1>
                
                {/* Audio Button */}
                <button 
                    onClick={onPlayAudio}
                    disabled={isPlaying}
                    className={`group flex items-center justify-center w-12 h-12 rounded-full transition-all flex-shrink-0
                      ${hasError 
                        ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
                        : 'bg-zinc-800 hover:bg-twitch-base text-twitch-light hover:text-white'
                      }`}
                    title={hasError ? "TTS Failed - Try Again" : "Listen to pronunciation"}
                >
                    {isPlaying ? (
                        <Loader2 size={24} className="animate-spin" />
                    ) : hasError ? (
                        <AlertCircle size={24} />
                    ) : (
                        <Volume2 size={24} className="group-hover:scale-110 transition-transform" />
                    )}
                </button>
            </div>
            
            <div className="flex items-center gap-2 text-lg text-zinc-400 font-mono mt-1">
                <span className="text-twitch-light/90 tracking-wide">
                    [{cleanPhonetic}]
                </span>
                <span className="w-1 h-1 bg-zinc-600 rounded-full" />
                <span className="italic text-zinc-500 text-base">
                    {data.partOfSpeech}
                </span>
            </div>
        </div>

        {/* Definition Box */}
        <div className="bg-zinc-800 rounded-lg p-5 border-l-4 border-twitch-base">
          <p className="text-xl md:text-2xl font-light leading-snug text-zinc-100">
            {data.definition}
          </p>
        </div>

        {/* Example Sentence */}
        <div className="px-1">
          <p className="text-base text-zinc-400 italic font-serif leading-relaxed">
            "{data.example}"
          </p>
        </div>
      </div>
    </div>
  );
};
