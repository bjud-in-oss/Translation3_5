import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { ClientData, ControlMessage, Room } from '../types';
import { AudioManager } from '../lib/audioManager';

import { LeftPane } from './LeftPane';
import { RightPane } from './RightPane';

export function ActiveRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomState, setRoomState] = useState<Room | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [me, setMe] = useState<ClientData | null>(null);
  
  // UI State
  const [audioMuted, setAudioMuted] = useState(true); // Default muted per spec
  
  // Hardware State
  const [isMicActive, setIsMicActive] = useState(false); // Default muted
  const [audioDevices, setAudioDevices] = useState<{inputs: MediaDeviceInfo[], outputs: MediaDeviceInfo[]}>({inputs: [], outputs: []});
  const [selectedInput, setSelectedInput] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<string>('');

  const audioManager = useRef<AudioManager>(new AudioManager());

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devs => {
      setAudioDevices({
        inputs: devs.filter(d => d.kind === 'audioinput'),
        outputs: devs.filter(d => d.kind === 'audiooutput')
      });
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket;
    
    try {
      socket = new WebSocket(`${protocol}//${window.location.host}`);
      setWs(socket);

      socket.onopen = () => {
         const savedName = localStorage.getItem('savedName') || null;
         socket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: roomId, name: savedName }));
      };

      socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          const msg: ControlMessage = JSON.parse(event.data);
          if (msg.type === 'ROOM_STATE') {
            setRoomState(msg.room);
            setClients(msg.clients);
            
            const savedNameStr = localStorage.getItem('savedName');
            const myData = msg.clients.find(c => savedNameStr ? c.name === savedNameStr : c.role === 'LISTENER' && c.name === null);
            if (myData) setMe(myData);
          } else if (msg.type === 'ERROR') {
             navigate('/');
          }
        } else if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          if (!audioMuted) {
             audioManager.current.playPCM24(arrayBuffer);
          }
        }
      };
      
      socket.onerror = () => {
         console.warn('WebSocket error, connection may be degraded.');
      };
    } catch(e) { 
         console.error('Failed to create WebSocket:', e);
    }
    
    const fallbackTimer = setTimeout(() => {
       setRoomState(prev => {
          if (prev) return prev;
          setMe({
             id: 'local-1',
             roomId: roomId || '1',
             name: localStorage.getItem('savedName') || null,
             role: 'LISTENER',
             targetLanguage: null,
             isSpeaking: false
          });
          return {
             id: roomId || '1',
             name: `Room ${roomId}`,
             type: 'CLASSROOM',
             adminId: null,
             adminName: null,
             hostConnected: false,
             mode: 'ONE_WAY',
             aecEnabled: true,
             activeLanguages: []
          };
       });
    }, 1500);

    return () => {
      clearTimeout(fallbackTimer);
      if (socket) socket.close();
      audioManager.current.stopCapture();
    };
  }, [roomId, navigate, audioMuted]);

  const toggleMic = async () => {
    if (!ws || !roomState) return;
    
    if (isMicActive) {
      audioManager.current.stopCapture();
      setIsMicActive(false);
      ws.send(JSON.stringify({ type: 'SET_SPEAKING', isSpeaking: false }));
    } else {
      try {
        await audioManager.current.startCapture(selectedInput || undefined, { aec: roomState.aecEnabled }, (pcm) => {
           if (ws.readyState === WebSocket.OPEN) {
             ws.send(pcm);
           }
        });
        setIsMicActive(true);
        ws.send(JSON.stringify({ type: 'SET_SPEAKING', isSpeaking: true }));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSetName = (name: string, role: 'HOST' | 'PARTICIPANT') => {
     localStorage.setItem('savedName', name);
     ws?.send(JSON.stringify({ type: 'SET_NAME', name, role }));
  };

  const currentId = parseInt(roomId || '1');
  const navigatePrev = () => navigate('/room/' + (currentId === 1 ? 3 : currentId - 1));
  const navigateNext = () => navigate('/room/' + (currentId === 3 ? 1 : currentId + 1));

  if (!roomState || !me) {
    return <div className="flex h-screen w-screen bg-slate-950 items-center justify-center"><Languages size={48} className="animate-spin text-slate-800" /></div>;
  }

  // Find who is currently speaking (for the translation dim effect)
  const isSomeoneSpeaking = clients.some(c => c.isSpeaking);

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col md:flex-row font-sans overflow-hidden">
        
       {/* Left Pane */}
       <div className="flex-1 md:w-1/2 md:flex-none">
          <LeftPane 
             roomId={roomId || '1'}
             roomType={roomState.type}
             activeLanguages={roomState.activeLanguages}
             targetLanguage={me.targetLanguage}
             onLanguageSelect={(lang) => ws?.send(JSON.stringify({ type: 'SET_LANGUAGE', language: lang }))}
             onAddLanguage={(lang) => ws?.send(JSON.stringify({ type: 'ADD_LANGUAGE', language: lang }))}
             onNavigatePrev={navigatePrev}
             onNavigateNext={navigateNext}
             hostSpeaking={isSomeoneSpeaking}
          />
       </div>

       {/* Right Pane */}
       <div className="flex-1 md:w-1/2 md:flex-none">
          <RightPane 
             roomState={roomState}
             clients={clients}
             me={me}
             ws={ws}
             isMicActive={isMicActive}
             audioMuted={audioMuted}
             onToggleMic={toggleMic}
             onToggleAudio={() => setAudioMuted(!audioMuted)}
             audioDevices={audioDevices}
             selectedInput={selectedInput}
             selectedOutput={selectedOutput}
             onSelectInput={setSelectedInput}
             onSelectOutput={(out) => { setSelectedOutput(out); audioManager.current.setOutputDevice(out); }}
             onSetName={handleSetName}
          />
       </div>

    </div>
  );
}
