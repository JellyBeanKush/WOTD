
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Disc, Clock, Twitch, Settings, CheckCircle2, CircleDashed, Key, User, Activity, Terminal, AlertTriangle, Link2, Copy } from 'lucide-react';
import { WEBHOOK_KEY, AUTO_POST_TIME_KEY, TWITCH_CHANNEL_KEY, TWITCH_USERNAME_KEY, TWITCH_TOKEN_KEY, TTS_COMMAND_KEY, LAST_POST_DATE_KEY, STORAGE_KEY } from '../constants';
import { TwitchChatListener } from '../services/twitchChatService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoPostTime, setAutoPostTime] = useState('');
  
  // Twitch State
  const [twitchChannel, setTwitchChannel] = useState('');
  const [twitchUsername, setTwitchUsername] = useState('');
  const [twitchToken, setTwitchToken] = useState('');
  const [ttsCommand, setTtsCommand] = useState('');
  
  // Debug State
  const [isTesting, setIsTesting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const testListenerRef = useRef<TwitchChatListener | null>(null);
  
  const [lastPostDate, setLastPostDate] = useState('');
  const [saved, setSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setWebhookUrl(localStorage.getItem(WEBHOOK_KEY) || '');
      setAutoPostTime(localStorage.getItem(AUTO_POST_TIME_KEY) || '');
      setTwitchChannel(localStorage.getItem(TWITCH_CHANNEL_KEY) || '');
      setTwitchUsername(localStorage.getItem(TWITCH_USERNAME_KEY) || '');
      setTwitchToken(localStorage.getItem(TWITCH_TOKEN_KEY) || '');
      setTtsCommand(localStorage.getItem(TTS_COMMAND_KEY) || '');
      setLastPostDate(localStorage.getItem(LAST_POST_DATE_KEY) || '');
      setLogs([]); // Clear logs on open
    } else {
        // Cleanup test listener on close
        if (testListenerRef.current) {
            testListenerRef.current.disconnect();
            testListenerRef.current = null;
        }
        setIsTesting(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    // Basic validation
    if (!twitchChannel && twitchToken) {
        alert("Please enter a Channel Name.");
        return;
    }

    localStorage.setItem(WEBHOOK_KEY, webhookUrl.trim());
    localStorage.setItem(AUTO_POST_TIME_KEY, autoPostTime);
    
    localStorage.setItem(TWITCH_CHANNEL_KEY, twitchChannel.trim());
    localStorage.setItem(TWITCH_USERNAME_KEY, twitchUsername.trim());
    localStorage.setItem(TWITCH_TOKEN_KEY, twitchToken.trim());
    localStorage.setItem(TTS_COMMAND_KEY, ttsCommand.trim());
    
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const handleCopyObsLink = () => {
      // 1. Gather all settings
      const payload = {
          wordData: JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'),
          settings: {
              [WEBHOOK_KEY]: webhookUrl.trim(),
              [AUTO_POST_TIME_KEY]: autoPostTime,
              [TWITCH_CHANNEL_KEY]: twitchChannel.trim(),
              [TWITCH_USERNAME_KEY]: twitchUsername.trim(),
              [TWITCH_TOKEN_KEY]: twitchToken.trim(),
              [TTS_COMMAND_KEY]: ttsCommand.trim()
          },
          overlay: true // Auto trigger overlay mode
      };

      // 2. Encode to base64 (handling unicode for definitions)
      const jsonString = JSON.stringify(payload);
      // btoa(unescape(encodeURIComponent(str))) handles UTF-8 characters properly
      const b64 = btoa(unescape(encodeURIComponent(jsonString)));
      
      const url = `${window.location.origin}/?sync=${b64}`;
      
      navigator.clipboard.writeText(url).then(() => {
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2000);
      });
  };

  const handleTestConnection = () => {
    if (isTesting) {
        // Stop testing
        if (testListenerRef.current) {
            testListenerRef.current.disconnect();
            testListenerRef.current = null;
        }
        setIsTesting(false);
        setLogs(prev => [...prev, "Test Stopped."]);
        return;
    }

    if (!twitchChannel) {
        setLogs(["ERROR: Channel Name is empty. Please enter your Twitch username."]);
        return;
    }

    setLogs(["Starting connection test..."]);
    setIsTesting(true);

    testListenerRef.current = new TwitchChatListener(
        { channel: twitchChannel, username: twitchUsername, token: twitchToken },
        (msg, user) => {
            // Echo chat messages to log
            setLogs(prev => [...prev, `[CHAT] ${user}: ${msg}`]);
        },
        (status, err) => {
            setLogs(prev => [...prev, `[STATUS] ${status} ${err ? `(${err})` : ''}`]);
            if (status === 'CONNECTED' && !twitchToken) {
                setLogs(prev => [...prev, `[WARN] No Token: Bot is in Read-Only mode.`]);
            }
        },
        (logMsg) => {
            setLogs(prev => [...prev, logMsg]);
        }
    );
  };

  const isPostedToday = lastPostDate === new Date().toDateString();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm fade-in">
      <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-2xl w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Settings size={24} className="text-twitch-light" /> App Settings
        </h2>

        <div className="space-y-8">
            
          {/* OBS Link Generator - Top Priority for fix */}
          <div className="bg-gradient-to-r from-zinc-800 to-zinc-900 p-4 rounded-lg border border-zinc-700">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Link2 size={16} className="text-twitch-light" /> OBS Integration
              </h3>
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                  Use this magic link in your OBS Browser Source. It syncs your current <b>Word</b> and <b>Settings</b> perfectly.
              </p>
              <button 
                onClick={handleCopyObsLink}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-twitch-base text-zinc-200 py-2 rounded text-xs font-mono transition-all"
              >
                  {linkCopied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} />}
                  {linkCopied ? "COPIED TO CLIPBOARD!" : "COPY OBS LINK"}
              </button>
          </div>
          
          {/* Twitch Integration Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-twitch-light uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-2">
              <Twitch size={16} /> Twitch Chat Trigger
            </h3>
            
            <div className="grid gap-3">
              <div>
                <label className="block text-xs font-mono text-zinc-500 mb-1 uppercase">Channel Name <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={twitchChannel}
                  onChange={(e) => setTwitchChannel(e.target.value)}
                  placeholder="Enter your Twitch channel..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-twitch-base transition-colors font-mono text-sm placeholder:text-zinc-700"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-500 mb-1 uppercase">Additional Triggers</label>
                <input 
                  type="text" 
                  value={ttsCommand}
                  onChange={(e) => setTtsCommand(e.target.value)}
                  placeholder="!custom, !vocab (comma separated)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-twitch-base transition-colors font-mono text-sm"
                />
                <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                    Default commands <span className="text-twitch-light">!word</span> and <span className="text-twitch-light">!wotd</span> are always active.
                </p>
              </div>
            </div>

            {/* Advanced Auth */}
            <div className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800 space-y-3">
              <p className="text-[10px] text-zinc-500 uppercase font-bold">Bot Configuration</p>
              
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 mb-1 flex items-center gap-1">
                   <User size={10} /> Bot Username (Optional)
                </label>
                <input 
                  type="text" 
                  value={twitchUsername}
                  onChange={(e) => setTwitchUsername(e.target.value)}
                  placeholder="Enter bot username..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 focus:outline-none focus:border-twitch-base text-xs font-mono placeholder:text-zinc-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-500 mb-1 flex items-center gap-1">
                   <Key size={10} /> OAuth Token
                </label>
                <input 
                  type="password" 
                  value={twitchToken}
                  onChange={(e) => setTwitchToken(e.target.value)}
                  placeholder="oauth:xxxxxxxxxxxxxx"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 focus:outline-none focus:border-twitch-base text-xs font-mono placeholder:text-zinc-700"
                />
                {!twitchToken && (
                    <div className="flex items-start gap-1 mt-2 text-[10px] text-yellow-500/80">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                        <span>Token required for Chat Replies. Without it, the bot can listen but cannot speak.</span>
                    </div>
                )}
              </div>

              {/* Debug Section */}
              <div className="border-t border-zinc-800 pt-3">
                  <div className="flex items-center justify-between mb-2">
                     <label className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                        <Terminal size={10} /> Connection Log
                     </label>
                     <button
                        onClick={handleTestConnection}
                        className={`text-[10px] px-2 py-1 rounded font-bold transition-colors
                            ${isTesting ? 'bg-red-900 text-red-300 hover:bg-red-800' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                     >
                        {isTesting ? 'Stop Test' : 'Test Connection'}
                     </button>
                  </div>
                  
                  {isTesting && (
                      <div className="bg-black rounded p-2 h-24 overflow-y-auto font-mono text-[10px] text-green-400 whitespace-pre-wrap border border-zinc-800">
                          {logs.length === 0 ? <span className="text-zinc-600">Waiting for logs...</span> : logs.map((l, i) => (
                              <div key={i}>{l}</div>
                          ))}
                      </div>
                  )}
              </div>
            </div>

          </div>

          {/* Discord Integration Section */}
          <div className="space-y-4">
             <h3 className="text-sm font-bold text-[#5865F2] uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-2">
              <Disc size={16} /> Discord Auto-Post
            </h3>

            <div>
              <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Webhook URL</label>
              <input 
                type="password" 
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-[#5865F2] transition-colors font-mono text-xs placeholder:text-zinc-700"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase flex items-center gap-2">
                <Clock size={14} /> Daily Post Time
              </label>
              <div className="flex items-center gap-3">
                <input 
                  type="time" 
                  value={autoPostTime}
                  onChange={(e) => setAutoPostTime(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-[#5865F2] transition-colors font-mono text-sm"
                />
                
                {/* Status Indicator */}
                {autoPostTime && (
                  <div 
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border 
                    ${isPostedToday 
                      ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}
                    title={isPostedToday ? "Word posted to Discord today" : "Waiting for time or next app launch"}
                  >
                    {isPostedToday ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
                    {isPostedToday ? "POSTED" : "PENDING"}
                  </div>
                )}
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            className={`w-full py-3 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 mt-2
              ${saved ? 'bg-green-600' : 'bg-twitch-base hover:bg-twitch-dark'}`}
          >
            {saved ? 'Settings Saved!' : 'Save All Settings'}
            {!saved && <Save size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};
