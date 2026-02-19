
import { GoogleGenAI, Modality } from "@google/genai";

// Cache to store the raw PCM audio data (Uint8Array) by word
const audioCache = new Map<string, Uint8Array>();

// --- WAV Header Helper Functions ---

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function createWavHeader(dataLength: number, sampleRate: number, numChannels: number, bitsPerSample: number) {
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true); // Subchunk2Size

  return buffer;
}

// Convert Base64 string to Uint8Array
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Fallback: Use the browser's native SpeechSynthesis API
 * Reliable, even if lower quality.
 */
const playBrowserTTS = (text: string) => {
  return new Promise<void>((resolve, reject) => {
    if (!window.speechSynthesis) {
        reject(new Error("Browser TTS not supported"));
        return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; 
    utterance.volume = 1.0;
    
    // Try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Samantha"));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
        console.error("Browser TTS Error", e);
        reject(e);
    };
    
    window.speechSynthesis.speak(utterance);
  });
};

/**
 * Fetches audio from Gemini and caches it without playing.
 * Call this as soon as the word is generated.
 */
export const preloadWordAudio = async (word: string, definition: string, example: string) => {
    if (audioCache.has(word)) return;

    try {
        const audioBytes = await fetchTTS(word, definition, example);
        audioCache.set(word, audioBytes);
        console.log(`[TTS] Cached audio for "${word}"`);
    } catch (e) {
        console.warn("[TTS] Preload failed (will try fallback on play)", e);
    }
};

const fetchTTS = async (word: string, definition: string, example: string): Promise<Uint8Array> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Conversational prompt works better for the Audio model
    const prompt = `The word of the day is ${word}. Definition: ${definition}. For example: ${example}`;
  
    let lastError;
    const MAX_RETRIES = 3;

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseModalities: ["AUDIO" as Modality], // Use string literal cast for safety
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' },
              },
            },
          },
        });
      
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (!base64Audio) {
          throw new Error("No audio data received from Gemini");
        }

        return decode(base64Audio);

      } catch (e: any) {
        lastError = e;
        const msg = e.message || JSON.stringify(e);
        
        // Retry on Server Errors (503, 500, Internal, XHR/RPC failures)
        if (msg.includes('503') || msg.includes('overloaded') || msg.includes('500') || msg.includes('Internal') || msg.includes('Rpc failed') || msg.includes('xhr error')) {
          console.warn(`[TTS] API Error (${msg}). Retrying (Attempt ${i + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 1000 * (i + 1))); 
          continue;
        }
        break; 
      }
    }
    throw lastError;
};

export const playWordPronunciation = async (word: string, definition: string, example: string) => {
  try {
    let pcmData: Uint8Array;

    // --- STRATEGY: Try Gemini High-Quality TTS First ---
    try {
        if (audioCache.has(word)) {
            console.log(`[TTS] Playing "${word}" from cache`);
            pcmData = audioCache.get(word)!;
        } else {
            console.log(`[TTS] Fetching "${word}" live...`);
            pcmData = await fetchTTS(word, definition, example);
            audioCache.set(word, pcmData);
        }

        // Play WAV
        const wavHeader = createWavHeader(pcmData.length, 24000, 1, 16);
        const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(wavBlob);
        const audio = new Audio(audioUrl);
        
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        audio.onerror = (e) => {
            console.error("[TTS] Audio Object Error", e);
            URL.revokeObjectURL(audioUrl);
            // If WAV playback fails, try browser TTS
            playBrowserTTS(`${word}. ${definition}`);
        };

        await audio.play();

    } catch (apiError) {
        // --- FALLBACK STRATEGY: Browser Native TTS ---
        console.warn("[TTS] Gemini TTS Unavailable. Switching to Fallback.", apiError);
        await playBrowserTTS(`${word}. ${definition}`);
    }

  } catch (criticalError) {
    console.error("TTS Critical Failure:", criticalError);
    throw criticalError;
  }
};
