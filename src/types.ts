export interface Room {
  id: string;
  adminId: string | null;
  adminName: string | null;
  name: string;
  type: 'CHURCH' | 'CLASSROOM' | 'CONFERENCE';
  mode: 'ONE_WAY' | 'TWO_WAY';
  aecEnabled: boolean;
  activeLanguages: string[]; // ['en', 'es', 'sv']
  hostConnected: boolean;
}

export type ClientRole = 'HOST' | 'PARTICIPANT' | 'LISTENER';

export interface ClientData {
  id: string;
  roomId: string;
  name: string | null;
  role: ClientRole;
  targetLanguage: string | null; 
  isSpeaking: boolean;
  apiKey: string | null;
}

export type ControlMessage =
  | { type: 'GET_ROOMS' }
  | { type: 'ROOMS_LIST'; rooms: Room[] }
  | { type: 'JOIN_ROOM'; roomId: string; name: string | null }
  | { type: 'ROOM_STATE'; room: Room; clients: ClientData[] }
  | { type: 'UPDATE_MODE'; mode: Room['mode'] }
  | { type: 'TOGGLE_AEC'; aecEnabled: boolean }
  | { type: 'SET_NAME'; name: string; role?: 'HOST' | 'PARTICIPANT' }
  | { type: 'ADD_LANGUAGE'; language: string }
  | { type: 'SET_LANGUAGE'; language: string }
  | { type: 'SET_SPEAKING'; isSpeaking: boolean }
  | { type: 'SET_API_KEY'; apiKey: string }
  | { type: 'API_KEY_REQUIRED' }
  | { type: 'TRANSCRIPTION'; text: string; language: string; isFinal: boolean; original?: boolean }
  | { type: 'ERROR'; message: string };


