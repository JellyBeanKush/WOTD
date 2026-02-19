
import React from 'react';
import { RefreshCw, Monitor, Settings, EyeOff } from 'lucide-react';

interface ControlsProps {
  onRefresh: () => void;
  onToggleOverlay: () => void;
  onOpenSettings: () => void;
  isOverlayMode: boolean;
  isLoading: boolean;
}

export const Controls: React.FC<ControlsProps> = ({ onRefresh, onToggleOverlay, onOpenSettings, isOverlayMode, isLoading }) => {
  
  // In Overlay Mode, we hide controls by default but show them on hover
  // This allows the user to "Interact" with the OBS source to click buttons if needed
  const containerClass = isOverlayMode
    ? "fixed bottom-0 left-0 right-0 p-6 flex justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 z-50"
    : "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2";

  const wrapperClass = isOverlayMode
    ? "bg-black/80 backdrop-blur-md border border-zinc-700 p-2 rounded-2xl shadow-xl flex items-center gap-2"
    : "bg-zinc-900/90 backdrop-blur-md border border-zinc-700 p-2 rounded-2xl shadow-xl flex items-center gap-2";

  return (
    <div className={containerClass}>
      <div className={wrapperClass}>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-all disabled:opacity-50"
          title="Force New Word (Skip Daily Lock)"
        >
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          {!isOverlayMode && <span className="text-sm font-medium">New Word</span>}
        </button>

        <div className="w-px h-6 bg-zinc-700 mx-1" />

        <button
          onClick={onToggleOverlay}
          className="flex items-center gap-2 px-4 py-2 text-twitch-light hover:text-white hover:bg-twitch-base rounded-xl transition-all"
          title={isOverlayMode ? "Exit OBS Mode" : "Enter OBS Mode"}
        >
          {isOverlayMode ? <EyeOff size={20} /> : <Monitor size={20} />}
          {!isOverlayMode && <span className="text-sm font-medium">OBS Mode</span>}
        </button>

        <div className="w-px h-6 bg-zinc-700 mx-1" />

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
          title="Settings & Integrations"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
};
