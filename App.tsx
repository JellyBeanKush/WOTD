
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateWordOfTheDay } from './services/geminiService';
import { sendToDiscord } from './services/discordService';
import { TwitchChatListener } from './services/twitchChatService';
import { playWordPronunciation, preloadWordAudio } from './services/ttsService';
import { WordData, AppState } from './types';
import { STORAGE_KEY, WEBHOOK_KEY, AUTO_POST_TIME_KEY, LAST_POST_DATE_KEY, TWITCH_CHANNEL_KEY, TWITCH_USERNAME_KEY, TWITCH_TOKEN_KEY, TTS_COMMAND_KEY, HISTORY_KEY } from './constants';
import { WordCard } from './components/WordCard';
import { Controls } from './components/Controls';
import { SettingsModal } from './components/SettingsModal';
import { Loader2, AlertCircle, X, Monitor, Twitch } from 'lucide-react';

const App: React.FC = () => {
  const [data, setData] = useState<WordData | null>(null);
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Audio State (Lifted to allow Twitch Trigger Visualization)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);

  // Twitch Status State
  const [twitchStatus, setTwitchStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'>('DISCONNECTED');
  const [twitchError, setTwitchError] = useState<string>('');
  const [connectTrigger, setConnectTrigger] = useState(0); 
  
  const twitchListenerRef = useRef<TwitchChatListener | null>(null);
  const dataRef = useRef<WordData | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
    // PRELOAD AUDIO: As soon as data is available, fetch the TTS
    if (data) {
        preloadWordAudio(data.word, data.definition, data.example).catch(err => 
            console.error("Audio Preload Failed:", err)
        );
    }
  }, [data]);

  const handlePlayAudio = async () => {
      if (!dataRef.current || isAudioPlaying) return;
      
      setIsAudioPlaying(true);
      setAudioError(false);
      try {
          await playWordPronunciation(
              dataRef.current.word, 
              dataRef.current.definition, 
              dataRef.current.example
          );
      } catch (e) {
          console.error("Playback failed", e);
          setAudioError(true);
          setTimeout(() => setAudioError(false), 3000);
      } finally {
          setIsAudioPlaying(false);
      }
  };

  const loadData = useCallback(async (forceRefresh = false) => {
    if (isFetchingRef.current) return;

    setErrorMsg('');
    setState(AppState.LOADING);
    isFetchingRef.current = true;
    
    try {
      // 0. URL SYNC LOGIC (Fix for OBS isolation)
      // Check if we are loading from a shared URL which contains the state
      const params = new URLSearchParams(window.location.search);
      const syncParam = params.get('sync');
      
      if (syncParam && !forceRefresh) {
          try {
             // Decode base64 unicode string
             const jsonString = decodeURIComponent(escape(atob(syncParam)));
             const decoded = JSON.parse(jsonString);
             
             console.log("Syncing from URL...");

             // 1. Restore Settings to LocalStorage (so they persist if user refreshes)
             if (decoded.settings) {
                 Object.entries(decoded.settings).forEach(([k, v]) => {
                     if (v !== undefined && v !== null) {
                        localStorage.setItem(k, v as string);
                     }
                 });
             }

             // 2. Restore Word Data
             if (decoded.wordData) {
                 setData(decoded.wordData);
                 localStorage.setItem(STORAGE_KEY, JSON.stringify(decoded.wordData));
                 setState(AppState.SUCCESS);
                 isFetchingRef.current = false;
                 
                 // Force Twitch reconnect with new settings
                 setConnectTrigger(prev => prev + 1);
                 
                 // Check if overlay mode was requested via URL
                 if (decoded.overlay) {
                     setIsOverlayMode(true);
                 }
                 return;
             }
          } catch(e) { 
              console.error("Sync error", e); 
          }
      }

      // --- Normal Load Logic ---
      const today = new Date().toDateString();

      // 1. Check Local Storage first (Persistence)
      const storedJson = localStorage.getItem(STORAGE_KEY);
      if (storedJson && !forceRefresh) {
        const storedData: WordData = JSON.parse(storedJson);
        // STRICT CHECK: If the stored word is from today, use it. Do NOT generate a new one.
        if (storedData.generatedDate === today) {
          console.log("Loaded word from LOCAL STORAGE:", storedData.word);
          setData({ ...storedData, source: 'local' });
          setState(AppState.SUCCESS);
          isFetchingRef.current = false;
          return;
        }
      }

      // 2. Load History to prevent duplicates
      const historyJson = localStorage.getItem(HISTORY_KEY);
      const history: WordData[] = historyJson ? JSON.parse(historyJson) : [];
      const pastWords = history.map(h => h.word);

      // 3. Generate New Word
      console.log("Generating new word from Gemini...");
      const newData = await generateWordOfTheDay(pastWords);
      
      const dataWithSource = { ...newData, source: 'local' as const };
      
      // 4. Save to Current State AND History
      setData(dataWithSource);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataWithSource));
      
      // Update History (Keep last 100 words to avoid hitting token limits in prompt)
      const newHistory = [dataWithSource, ...history].slice(0, 100);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));

      // 5. MANUAL REFRESH DISCORD POST
      // If the user manually clicked "New Word" (forceRefresh = true), send to Discord immediately.
      if (forceRefresh) {
          const webhook = localStorage.getItem(WEBHOOK_KEY);
          if (webhook) {
              console.log("Manual refresh detected. Posting to Discord...");
              sendToDiscord(webhook, dataWithSource)
                  .then(() => {
                      // Update the "Last Posted" date so the auto-timer doesn't double post later
                      localStorage.setItem(LAST_POST_DATE_KEY, new Date().toDateString());
                  })
                  .catch(err => console.error("Manual Discord Post Failed", err));
          }
      }

      setState(AppState.SUCCESS);

    } catch (e: any) {
      console.error(e);
      if (e.message && e.message.includes("Duplicate")) {
          // Simple retry once if duplicate
          isFetchingRef.current = false;
          loadData(true); 
          return;
      }
      setErrorMsg(e.message || "Failed to generate word.");
      setState(AppState.ERROR);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Twitch Integration
  useEffect(() => {
    const channel = localStorage.getItem(TWITCH_CHANNEL_KEY);
    const username = localStorage.getItem(TWITCH_USERNAME_KEY) || undefined;
    const token = localStorage.getItem(TWITCH_TOKEN_KEY) || undefined;
    const customCommandStr = localStorage.getItem(TTS_COMMAND_KEY) || '';

    // Disconnect previous instance
    if (twitchListenerRef.current) {
        twitchListenerRef.current.disconnect();
        twitchListenerRef.current = null;
    }

    if (channel) {
      setTwitchStatus('CONNECTING');
      setTwitchError('');
      
      twitchListenerRef.current = new TwitchChatListener(
        { channel, username, token }, 
        async (message, user) => {
            if (!dataRef.current) return;

            const msgLower = message.toLowerCase().trim();
            
            // Trigger Logic: Allow !word, !wotd, AND multiple custom comma-separated commands
            const customTriggers = customCommandStr.split(',')
                .map(c => c.trim().toLowerCase())
                .filter(c => c.length > 0);

            const triggers = ['!word', '!wotd', ...customTriggers];
            
            // Check if message starts with any trigger
            const isTriggered = triggers.some(t => msgLower.startsWith(t));

            if (isTriggered) {
                // Avoid overlapping playback
                // Note: We check state here, but since it's inside a closure, we use the ref or just let handlePlayAudio manage it
                // Calling handlePlayAudio is safe because it checks isAudioPlaying state
                handlePlayAudio();

                // 1. Send Reply to Chat (if token exists) - Fire and forget
                if (twitchListenerRef.current && !twitchListenerRef.current.isReadOnly) {
                    const word = dataRef.current.word;
                    const def = dataRef.current.definition;
                    const phonetic = dataRef.current.phonetic;
                    twitchListenerRef.current.send(`📖 Word of the Day: ${word} (${phonetic}) — ${def}`);
                }
            }
        },
        (status, err) => {
            setTwitchStatus(status);
            if (err) setTwitchError(err);
            else if (status === 'CONNECTED') setTwitchError('');
        },
        // Log handler (Main app doesn't need to show verbose logs, just console)
        (msg) => console.log(msg)
      );
    } else {
        setTwitchStatus('DISCONNECTED');
        setTwitchError('');
    }
    
    return () => { 
        twitchListenerRef.current?.disconnect(); 
    };
  }, [connectTrigger]); 

  const handleRetryTwitch = () => {
    setConnectTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!isSettingsOpen) {
        handleRetryTwitch();
    }
  }, [isSettingsOpen]);


  // Auto-Post Timer Logic
  useEffect(() => {
    const checkAutoPost = async () => {
      if (!data) return;

      const webhook = localStorage.getItem(WEBHOOK_KEY);
      const timeSetting = localStorage.getItem(AUTO_POST_TIME_KEY);
      const lastPostedDate = localStorage.getItem(LAST_POST_DATE_KEY);
      const today = new Date().toDateString();

      if (!webhook || !timeSetting) return;
      
      // If we already posted today (either automatically or manually), skip.
      if (lastPostedDate === today) return;

      const now = new Date();
      const [targetHour, targetMinute] = timeSetting.split(':').map(Number);
      const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMinute);

      // If it's past the time
      if (now >= targetTime) {
        try {
          console.log("Triggering Auto-Post to Discord...");
          await sendToDiscord(webhook, data);
          localStorage.setItem(LAST_POST_DATE_KEY, today);
        } catch (e) {
          console.error("Auto-Post Failed", e);
        }
      }
    };

    checkAutoPost();
    const interval = setInterval(checkAutoPost, 60000);
    return () => clearInterval(interval);
  }, [data]);

  // Handle transparent background
  useEffect(() => {
    if (isOverlayMode) {
      document.body.style.backgroundColor = 'transparent';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOverlayMode(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.backgroundColor = '#0f0e11';
    }
  }, [isOverlayMode]);

  const getTwitchStatusColor = () => {
      if (twitchStatus === 'CONNECTED') return 'bg-purple-900/30 border-purple-500/30 text-purple-400 hover:bg-purple-900/50';
      if (twitchStatus === 'CONNECTING') return 'bg-yellow-900/30 border-yellow-500/30 text-yellow-400 cursor-wait';
      // Error State
      if (twitchError) return 'bg-red-900/30 border-red-500/30 text-red-400 hover:bg-red-900/50 cursor-pointer';
      
      return 'bg-zinc-900/50 border-zinc-700 text-zinc-500 hover:bg-zinc-800 cursor-pointer';
  };

  const getTwitchStatusText = () => {
    if (twitchStatus === 'CONNECTED') return 'Twitch: Connected';
    if (twitchStatus === 'CONNECTING') return 'Connecting...';
    if (twitchError) return `Error: ${twitchError}`;
    return 'Twitch: OFF (Retry)';
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${isOverlayMode ? 'bg-transparent' : 'bg-[#0f0e11]'}`}>
      
      {!isOverlayMode && (
        <header className="absolute top-6 left-6 right-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-twitch-base animate-pulse" />
                <h1 className="text-xl font-bold text-zinc-300 tracking-wide">
                    Streamer<span className="text-twitch-light">WOTD</span>
                </h1>
                <span className="flex items-center gap-1 text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
                    <Monitor size={10} /> LOCAL MODE
                </span>
            </div>

            {/* Twitch Status Indicator */}
            <button 
                onClick={handleRetryTwitch}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${getTwitchStatusColor()}`}
                title="Click to reconnect Twitch Chat"
                disabled={twitchStatus === 'CONNECTING'}
            >
                {twitchStatus === 'CONNECTING' ? <Loader2 size={14} className="animate-spin" /> : <Twitch size={14} />}
                <span>{getTwitchStatusText()}</span>
            </button>
        </header>
      )}

      <main className="w-full flex flex-col items-center relative">
        {state === AppState.LOADING && (
          <div className="flex flex-col items-center justify-center gap-4 text-twitch-light animate-pulse">
            <Loader2 size={48} className="animate-spin" />
            <p className="text-zinc-400 font-mono text-sm">Brewing fresh words...</p>
          </div>
        )}

        {state === AppState.ERROR && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-center max-w-md">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">
                Generation Failed
            </h3>
            <p className="text-red-300 mb-4">
                {errorMsg}
            </p>
            <p className="text-xs text-zinc-500 mb-4">Check your API Key in the .env file</p>
            <button 
              onClick={() => loadData(true)}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-2 mx-auto"
            >
              Retry
            </button>
          </div>
        )}

        {state === AppState.SUCCESS && data && (
          <WordCard 
            data={data} 
            isOverlayMode={isOverlayMode} 
            onOpenSettings={() => setIsSettingsOpen(true)}
            isPlaying={isAudioPlaying}
            onPlayAudio={handlePlayAudio}
            hasError={audioError}
          />
        )}
      </main>

      <Controls 
        isLoading={state === AppState.LOADING}
        isOverlayMode={isOverlayMode}
        onRefresh={() => loadData(true)}
        onToggleOverlay={() => setIsOverlayMode(!isOverlayMode)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => {
            setIsSettingsOpen(false);
        }} 
      />

      {isOverlayMode && (
        <button 
          onClick={() => setIsOverlayMode(false)}
          className="fixed top-4 right-4 bg-zinc-900/50 hover:bg-red-500/80 text-white p-2 rounded-full transition-all backdrop-blur-sm z-50 group"
          title="Exit OBS Mode (or press ESC)"
        >
          <X size={20} className="opacity-50 group-hover:opacity-100" />
          <span className="sr-only">Exit Overlay Mode</span>
        </button>
      )}
    </div>
  );
};

export default App;
