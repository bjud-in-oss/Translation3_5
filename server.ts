import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';
import { Room, ClientData, ControlMessage, ClientRole } from './src/types';

// State Management
const rooms: Map<string, Room> = new Map([
  ['1', { id: '1', name: 'Church Hall', type: 'CHURCH', adminId: null, adminName: null, hostConnected: false, mode: 'ONE_WAY', aecEnabled: true, activeLanguages: [] }],
  ['2', { id: '2', name: 'Language Resource Rm', type: 'CLASSROOM', adminId: null, adminName: null, hostConnected: false, mode: 'ONE_WAY', aecEnabled: true, activeLanguages: [] }],
  ['3', { id: '3', name: 'Study Group', type: 'CLASSROOM', adminId: null, adminName: null, hostConnected: false, mode: 'ONE_WAY', aecEnabled: true, activeLanguages: [] }]
]);
const clients: Map<string, ClientData> = new Map();
const clientSockets: Map<string, WebSocket> = new Map();

// Gemini Multiplexing State
// For a given room, there may be multiple target languages.
// We maintain ONE Gemini WS connection per room per target language.
interface GeminiSession {
  roomId: string;
  targetLanguage: string;
  liveSession: any | null; 
  clients: Set<string>; // Client IDs listening to this session
  createdAt: number;
  isDemo: boolean;
  apiKey: string | null;
  resumptionHandle?: string;
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

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    // Let Vite handle its own HMR websockets
    if (req.headers['sec-websocket-protocol'] === 'vite-hmr' || req.url === '/vite-hmr') {
      return;
    }
    
    // We only want our app websocket connections here (typically at '/')
    if (req.url === '/') {
       wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
       });
    }
  });

  wss.on('connection', (ws) => {
    let clientId = uuidv4();
    clientSockets.set(clientId, ws);

    ws.on('message', (message, isBinary) => {
      if (isBinary) {
        // This is audio data (16kHz PCM from a speaker).
        // Find the client and route to all active Gemini sessions in the room
        const client = clients.get(clientId);
        if (client && (client.role === 'HOST' || client.role === 'PARTICIPANT')) {
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
    } else if (msg.type === 'JOIN_ROOM') {
      let room = rooms.get(msg.roomId);
      if (!room) {
         ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
         return;
      }
      
      let role: ClientRole = 'LISTENER';
      // If host re-joins
      if (msg.name && room.adminName === msg.name) {
        role = 'HOST';
        room.adminId = clientId;
        room.hostConnected = true;
      }
      
      const newClient: ClientData = {
        id: clientId,
        roomId: msg.roomId,
        name: msg.name || null,
        role: role,
        targetLanguage: null,
        isSpeaking: false,
        apiKey: null
      };
      
      clients.set(clientId, newClient);
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
      } else if (msg.type === 'SET_NAME') {
          client.name = msg.name;
          if (msg.role === 'HOST' && !room.adminId) {
             room.adminId = clientId;
             room.adminName = msg.name;
             room.hostConnected = true;
             client.role = 'HOST';
          } else if (msg.role) {
             client.role = msg.role;
          } else {
             client.role = 'PARTICIPANT';
          }
          broadcastRoomState(client.roomId);
          broadcastRoomsList();
      } else if (msg.type === 'ADD_LANGUAGE') {
        if (room.adminId === clientId) {
          if (!room.activeLanguages.includes(msg.language) && room.activeLanguages.length < 3) {
             room.activeLanguages.push(msg.language);
             broadcastRoomState(client.roomId);
          }
        }
      } else if (msg.type === 'SET_API_KEY') {
         client.apiKey = msg.apiKey;
         if (client.targetLanguage) {
             ensureGeminiSession(client.roomId, client.targetLanguage, clientId, true);
         }
      } else if (msg.type === 'SET_LANGUAGE') {
         client.targetLanguage = msg.language;
         
         // Remove from old session
         const oldSessions = Array.from(geminiSessions.values()).filter(s => s.clients.has(clientId));
         oldSessions.forEach(s => s.clients.delete(clientId));
         
         ensureGeminiSession(client.roomId, msg.language, clientId, false);
         broadcastRoomState(client.roomId);
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
        room.adminId = null; // Unclaim host if they disconnect
      }
      broadcastRoomState(client.roomId);
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

  function ensureGeminiSession(roomId: string, targetLanguage: string, clientId: string, forceReconnect: boolean) {
    const sessionKey = `${roomId}_${targetLanguage}`;
    let session = geminiSessions.get(sessionKey);
    const client = clients.get(clientId);
    const room = rooms.get(roomId);
    
    // Determine API Key (bypass demo limit if custom key is provided)
    // 1. System environment
    // 2. The client's own key
    // 3. The room host's key
    let apiKey = process.env.GEMINI_API_KEY;
    let isDemo = true;

    if (client?.apiKey) {
       apiKey = client.apiKey;
       isDemo = false;
    } else if (room?.adminId) {
       const hostClient = clients.get(room.adminId);
       if (hostClient?.apiKey) {
          apiKey = hostClient.apiKey;
          isDemo = false;
       }
    }

    if (process.env.GEMINI_API_KEY) {
       isDemo = false;
    }
    
    if (!session || forceReconnect) {
      if (session && session.liveSession) {
         try { session.liveSession.close(); } catch(e){}
      }
      session = {
        roomId,
        targetLanguage,
        liveSession: null,
        clients: session ? session.clients : new Set(),
        createdAt: Date.now(),
        isDemo,
        apiKey: apiKey || null
      };
      geminiSessions.set(sessionKey, session);
      
      connectToGemini(sessionKey, targetLanguage, session);
    }
    
    session.clients.add(clientId);
  }

  async function connectToGemini(sessionKey: string, targetLanguage: string, session: GeminiSession) {
     if (!session.apiKey) {
        console.error("No API Key available to connect Gemini");
        return;
     }

     const ai = new GoogleGenAI({ apiKey: session.apiKey });
     try {
       const connectConfig: any = {
          responseModalities: ['AUDIO'],
          translationConfig: {
             targetLanguageCode: targetLanguage,
             echoTargetLanguage: false
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: "You are a real-time translator.",
          contextWindowCompression: {
             triggerTokens: "4000",
             slidingWindow: { targetTokens: "2000" }
          }
       };

       if (session.resumptionHandle) {
          connectConfig.sessionResumption = {
             handle: session.resumptionHandle,
             transparent: true
          };
       }

       session.liveSession = await ai.live.connect({
          model: 'gemini-3.5-live-translate-preview',
          config: connectConfig,
          callbacks: {
             onmessage: (msg: any) => {
                // If demo mode expired, stop doing anything.
                if (session.isDemo && Date.now() - session.createdAt > 15 * 60 * 1000) return;

                // Handle Session Resumption Tokens
                if (msg.sessionResumptionUpdate && msg.sessionResumptionUpdate.newHandle) {
                   session.resumptionHandle = msg.sessionResumptionUpdate.newHandle;
                }

                // Handle GoAway signals for background reconnections
                if (msg.goAway) {
                   console.warn(`GoAway received for session ${sessionKey}. Reconnecting...`);
                   if (session.liveSession) {
                      try { session.liveSession.close(); } catch(e){}
                      session.liveSession = null;
                   }
                   setTimeout(() => {
                      connectToGemini(sessionKey, targetLanguage, session);
                   }, 100);
                   return;
                }

                // Route audio back to clients listening to this session
                const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audio) {
                   session.clients.forEach(clientId => {
                      const ws = clientSockets.get(clientId);
                      if (ws && ws.readyState === WebSocket.OPEN) {
                         ws.send(JSON.stringify({ type: 'AUDIO', audio }));
                      }
                   });
                }
                
                // Route transcription to display in UI
                if (msg.serverContent?.modelTurn?.parts) {
                    const textParts = msg.serverContent.modelTurn.parts.filter(p => !!p.text);
                    if (textParts.length > 0) {
                       const text = textParts.map(p => p.text).join(' ');
                       session.clients.forEach(clientId => {
                          const ws = clientSockets.get(clientId);
                          if (ws && ws.readyState === WebSocket.OPEN) {
                             ws.send(JSON.stringify({ type: 'TRANSCRIPTION', text, language: targetLanguage, isFinal: true }));
                          }
                       });
                    }
                }
             }
          }
       });
       console.log(`Gemini connected for ${sessionKey}`);
     } catch(e) {
        console.error("Gemini Connection Error:", e);
     }
  }

  function broadcastAudioToGemini(roomId: string, audioBuffer: Buffer) {
     const sessions = Array.from(geminiSessions.values()).filter(s => s.roomId === roomId);
     sessions.forEach(s => {
       if (s.isDemo && Date.now() - s.createdAt > 15 * 60 * 1000) {
           // Notify clients that they need API Key
           s.clients.forEach(clientId => {
               const ws = clientSockets.get(clientId);
               if (ws && ws.readyState === WebSocket.OPEN) {
                   ws.send(JSON.stringify({ type: 'API_KEY_REQUIRED' }));
               }
           });
           // Close the session
           if (s.liveSession) {
               try { s.liveSession.close(); } catch(e){}
               s.liveSession = null;
           }
           geminiSessions.delete(`${s.roomId}_${s.targetLanguage}`);
           return;
       }
       if (s.liveSession) {
          try {
             s.liveSession.sendRealtimeInput({
                audio: { data: audioBuffer.toString('base64'), mimeType: 'audio/pcm;rate=16000' }
             });
          } catch(e) {
             console.error("Error sending input to Gemini:", e);
          }
       }
     });
  }

}

startServer();
