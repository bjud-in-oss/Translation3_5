import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';
import { Room, ClientData, ControlMessage } from './src/types';

// State Management
const rooms: Map<string, Room> = new Map();
const clients: Map<string, ClientData> = new Map();
const clientSockets: Map<string, WebSocket> = new Map();

// Gemini Multiplexing State
// For a given room, there may be multiple target languages.
// We maintain ONE Gemini WS connection per room per target language.
interface GeminiSession {
  roomId: string;
  targetLanguage: string;
  ws: WebSocket | null; 
  clients: Set<string>; // Client IDs listening to this session
}
const geminiSessions: Map<string, GeminiSession> = new Map(); // Key: `${roomId}_${targetLanguage}`

// Setup Express
const app = express();
const PORT = 3000;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  let vite;

  if (process.env.NODE_ENV !== 'production') {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    let clientId = uuidv4();
    clientSockets.set(clientId, ws);

    ws.on('message', (message, isBinary) => {
      if (isBinary) {
        // This is audio data (16kHz PCM from a speaker).
        // Find the client and route to all active Gemini sessions in the room
        const client = clients.get(clientId);
        if (client && (client.role === 'HOST_AUDIO_INJECTOR' || client.role === 'HOST_CONTROLLER' || client.role === 'PARTICIPANT')) {
          const room = rooms.get(client.roomId);
          if (room) {
             // Basic routing: send this audio to ALL gemini sessions for this room.
             broadcastAudioToGemini(room.id, message as Buffer);
          }
        }
      } else {
        // Control message (JSON)
        try {
          const data: ControlMessage = JSON.parse(message.toString());
          handleControlMessage(clientId, ws, data);
        } catch (e) {
          console.error("Failed to parse message:", message.toString());
        }
      }
    });

    ws.on('close', () => {
      handleClientDisconnect(clientId);
    });
  });

  function handleControlMessage(clientId: string, ws: WebSocket, msg: ControlMessage) {
    if (msg.type === 'GET_ROOMS') {
      ws.send(JSON.stringify({
        type: 'ROOMS_LIST',
        rooms: Array.from(rooms.values())
      }));
    } else if (msg.type === 'CREATE_ROOM') {
      const roomId = uuidv4().substring(0, 8);
      const newRoom: Room = {
        id: roomId,
        adminId: clientId,
        adminName: msg.adminName,
        type: msg.roomType,
        mode: 'ONE_WAY',
        aecEnabled: true,
        activeLanguages: ['en'],
        hostConnected: true
      };
      rooms.set(roomId, newRoom);
      
      const newClient: ClientData = {
        id: clientId,
        roomId: roomId,
        name: msg.adminName,
        role: 'HOST',
        targetLanguage: 'en',
        isSpeaking: false
      };
      clients.set(clientId, newClient);
      
      ensureGeminiSession(roomId, 'en', clientId);
      
      ws.send(JSON.stringify({ type: 'ROOM_STATE', room: newRoom, clients: [newClient] }));
      broadcastRoomsList();
    } else if (msg.type === 'JOIN_ROOM') {
      let room = rooms.get(msg.roomId);
      if (!room) {
         ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
         return;
      }
      
      // If admin rejoins
      let role: ClientRole = 'PARTICIPANT';
      if (room.adminName === msg.name) {
        role = 'HOST';
        room.adminId = clientId;
        room.hostConnected = true;
      }
      
      const targetLang = room.activeLanguages[0] || 'en';
      const newClient: ClientData = {
        id: clientId,
        roomId: msg.roomId,
        name: msg.name,
        role,
        targetLanguage: targetLang,
        isSpeaking: false
      };
      
      clients.set(clientId, newClient);
      ensureGeminiSession(msg.roomId, targetLang, clientId);
      
      broadcastRoomState(msg.roomId);
      broadcastRoomsList();
    } 
    else {
      const client = clients.get(clientId);
      if (!client) return;
      const room = rooms.get(client.roomId);
      if (!room) return;

      if (msg.type === 'UPDATE_MODE') {
        if (room.adminId === clientId) {
          room.mode = msg.mode;
          broadcastRoomState(client.roomId);
        }
      } else if (msg.type === 'TOGGLE_AEC') {
        if (room.adminId === clientId) {
          room.aecEnabled = msg.aecEnabled;
          broadcastRoomState(client.roomId);
        }
      } else if (msg.type === 'ADD_LANGUAGE') {
        if (room.adminId === clientId) {
          if (!room.activeLanguages.includes(msg.language) && room.activeLanguages.length < 3) {
             room.activeLanguages.push(msg.language);
             broadcastRoomState(client.roomId);
          }
        }
      } else if (msg.type === 'SET_LANGUAGE') {
        if (room.activeLanguages.includes(msg.language)) {
           client.targetLanguage = msg.language;
           
           // Remove from old session
           const oldSessions = Array.from(geminiSessions.values()).filter(s => s.clients.has(clientId));
           oldSessions.forEach(s => s.clients.delete(clientId));
           
           ensureGeminiSession(client.roomId, msg.language, clientId);
           broadcastRoomState(client.roomId);
        }
      } else if (msg.type === 'SET_SPEAKING') {
         client.isSpeaking = msg.isSpeaking;
         broadcastRoomState(client.roomId);
      }
    }
  }

  function broadcastRoomsList() {
    const listMsg = JSON.stringify({
      type: 'ROOMS_LIST',
      rooms: Array.from(rooms.values())
    });
    // Send to all clients that are not in a room yet
    Array.from(clientSockets.entries()).forEach(([id, socket]) => {
      if (!clients.has(id)) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(listMsg);
        }
      }
    });
  }

  function handleClientDisconnect(clientId: string) {
    const client = clients.get(clientId);
    if (!client) return;
    
    clientSockets.delete(clientId);
    clients.delete(clientId);
    
    // Remove from gemini session
    const sessionKey = `${client.roomId}_${client.targetLanguage}`;
    const session = geminiSessions.get(sessionKey);
    if (session) {
      session.clients.delete(clientId);
    }

    const room = rooms.get(client.roomId);
    if (room) {
      if (room.adminId === clientId) {
        room.hostConnected = false;
      }
      const clientsInRoom = Array.from(clients.values()).filter(c => c.roomId === client.roomId);
      if (clientsInRoom.length === 0) {
        rooms.delete(client.roomId);
      } else {
        broadcastRoomState(client.roomId);
      }
      broadcastRoomsList();
    }
  }

  function broadcastRoomState(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const clientsInRoom = Array.from(clients.values()).filter(c => c.roomId === roomId);
    const msg: ControlMessage = {
      type: 'ROOM_STATE',
      room,
      clients: clientsInRoom
    };
    const msgStr = JSON.stringify(msg);
    
    clientsInRoom.forEach(c => {
      const socket = clientSockets.get(c.id);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(msgStr);
      }
    });
  }

  function ensureGeminiSession(roomId: string, targetLanguage: string, clientId: string) {
    // Basic scaffold: This is where we would setup the connection to Google Live API
    // Real implementation requires connecting to `wss://generativelanguage.googleapis.com/...`
    const sessionKey = `${roomId}_${targetLanguage}`;
    let session = geminiSessions.get(sessionKey);
    
    if (!session) {
      session = {
        roomId,
        targetLanguage,
        ws: null, // Placeholder for actual Gemini WS
        clients: new Set()
      };
      geminiSessions.set(sessionKey, session);
      
      // TODO: Connect to Gemini and handle the stream
      connectToGemini(sessionKey, targetLanguage);
    }
    
    session.clients.add(clientId);
  }

  function connectToGemini(sessionKey: string, targetLanguage: string) {
     // Placeholder: Here we actually connect to Gemini Live API over WS.
     // For now we just simulate it by doing nothing until the full implementation.
  }

  function broadcastAudioToGemini(roomId: string, audioBuffer: Buffer) {
     // Forward the speaker's PCM to all active Gemini sessions in this room.
     const sessions = Array.from(geminiSessions.values()).filter(s => s.roomId === roomId);
     sessions.forEach(s => {
       // if (s.ws && s.ws.readyState === WebSocket.OPEN) {
       //    s.ws.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: audioBuffer.toString('base64') }] } }));
       // }
     });
  }

}

startServer();
