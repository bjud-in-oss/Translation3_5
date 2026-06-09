export interface Room {
  id: string;
  adminId: string;
  adminName: string;
  type: 'CHURCH' | 'CLASSROOM';
  mode: 'ONE_WAY' | 'TWO_WAY';
  aecEnabled: boolean;
  activeLanguages: string[]; // ['en', 'es', 'sv']
  hostConnected: boolean;
}

export type ClientRole = 'HOST' | 'PARTICIPANT';

export interface ClientData {
  id: string;
  roomId: string;
  name: string;
  role: ClientRole;
  targetLanguage: string; 
  isSpeaking: boolean;
}

export type ControlMessage =
  | { type: 'GET_ROOMS' }
  | { type: 'ROOMS_LIST'; rooms: Room[] }
  | { type: 'CREATE_ROOM'; roomType: 'CHURCH' | 'CLASSROOM'; adminName: string }
  | { type: 'JOIN_ROOM'; roomId: string; name: string }
  | { type: 'ROOM_STATE'; room: Room; clients: ClientData[] }
  | { type: 'UPDATE_MODE'; mode: Room['mode'] }
  | { type: 'TOGGLE_AEC'; aecEnabled: boolean }
  | { type: 'ADD_LANGUAGE'; language: string }
  | { type: 'SET_LANGUAGE'; language: string }
  | { type: 'SET_SPEAKING'; isSpeaking: boolean }
  | { type: 'ERROR'; message: string };

