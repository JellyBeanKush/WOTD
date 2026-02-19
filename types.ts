
export interface WordData {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  generatedDate: string; // ISO Date string to track "Day"
  source?: 'local' | 'server'; // Track where the word came from
}

export enum AppState {
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  IDLE = 'IDLE'
}

export interface HistoryItem extends WordData {
  id: string;
}
