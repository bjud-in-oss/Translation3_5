import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Mic, MicOff, Settings, Users, Radio, Smartphone, Headphones, ArrowRight, ArrowLeftRight, Volume2, Plus, Languages, VolumeX, ShieldAlert } from 'lucide-react';
import { ClientData, ClientRole, ControlMessage, Room } from '../types';
import { AudioManager } from '../lib/audioManager';

const LANGUAGE_FLAGS: Record<string, string> = {
  'en': '🇬🇧',
  'es': '🇪🇸',
  'sv': '🇸🇪',
  'fr': '🇫🇷',
  'de': '🇩🇪',
  'zh': '🇨🇳'
};

export function ActiveRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isCreateAction = roomId === 'new';
  const newType = searchParams.get('type') as 'CHURCH' | 'CLASSROOM';
  const name = searchParams.get('name') || searchParams.get('adminName') || localStorage.getItem('savedName') || '';

  const [ws, setWs] = useState<WebSocket | null>(null);
  
  const [roomState, setRoomState] = useState<Room | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [me, setMe] = useState<ClientData | null>(null);
  
  const [isMicActive, setIsMicActive] = useState(false);
  const [acousticMode, setAcousticMode] = useState<'TELEPHONE' | 'HEADSET' | 'PRO_AV'>('HEADSET');
  
  const [audioDevices, setAudioDevices] = useState<{inputs: MediaDeviceInfo[], outputs: MediaDeviceInfo[]}>({inputs: [], outputs: []});
  const [selectedInput, setSelectedInput] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const audioManager = useRef<AudioManager>(new AudioManager());

  useEffect(() => {
    if (!name) {
      navigate('/');
      return;
    }

    navigator.mediaDevices.enumerateDevices().then(devs => {
      setAudioDevices({
        inputs: devs.filter(d => d.kind === 'audioinput'),
        outputs: devs.filter(d => d.kind === 'audiooutput')
      });
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}`;
    const socket = new WebSocket(socketUrl);
    setWs(socket);

    socket.onopen = () => {
      if (isCreateAction) {
        socket.send(JSON.stringify({ type: 'CREATE_ROOM', roomType: newType, adminName: name }));
      } else {
        socket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: roomId, name: name }));
      }
    };

    socket.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const msg: ControlMessage = JSON.parse(event.data);
        if (msg.type === 'ROOM_STATE') {
          setRoomState(msg.room);
          setClients(msg.clients);
          const myData = msg.clients.find(c => c.name === name);
          if (myData) setMe(myData);
        }
      } else if (event.data instanceof Blob) {
        // Binary audio
        const arrayBuffer = await event.data.arrayBuffer();
        if (roomState?.mode === 'ONE_WAY' || roomState?.mode === 'TWO_WAY') {
           audioManager.current.playPCM24(arrayBuffer);
        }
      }
    };

    return () => {
      socket.close();
      audioManager.current.stopCapture();
    };
  }, [name, roomId, isCreateAction, newType, navigate]);

  const toggleMic = async () => {
    if (!ws || !roomState || !me) return;
    
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
        alert('🎤 ❌');
      }
    }
  };

  const handleOutputChange = async (targetId: string) => {
    setSelectedOutput(targetId);
    await audioManager.current.setOutputDevice(targetId);
  };

  if (!roomState || !me) return <div className="flex h-screen items-center justify-center"><Radio className="animate-spin text-slate-500" /></div>;

  const isHost = me.role === 'HOST';

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto flex flex-col gap-6">
      
      {/* Top Bar (Symbols Only) */}
      <div className="bg-slate-800 rounded-2xl p-4 shadow-lg border border-slate-700/50 flex flex-wrap items-center justify-between gap-4">
         <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-700 rounded-full transition"><Radio size={24} className="text-blue-400" /></button>
            <div className="h-6 w-px bg-slate-700" />
            <span className="font-semibold text-lg">{me.name} {isHost && '👑'}</span>
         </div>

         <div className="flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-full">
            {roomState.activeLanguages.map(lang => (
              <button 
                key={lang}
                onClick={() => ws?.send(JSON.stringify({ type: 'SET_LANGUAGE', language: lang }))}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${me.targetLanguage === lang ? 'bg-blue-600 shadow-md scale-110' : 'hover:bg-slate-700 opacity-60 hover:opacity-100'}`}
              >
                {LANGUAGE_FLAGS[lang] || lang}
              </button>
            ))}
            {isHost && roomState.activeLanguages.length < 3 && (
               <button 
                 onClick={() => {
                   const available = Object.keys(LANGUAGE_FLAGS).filter(l => !roomState.activeLanguages.includes(l));
                   if(available.length) ws?.send(JSON.stringify({ type: 'ADD_LANGUAGE', language: available[0] }));
                 }}
                 className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-700 hover:bg-slate-600 transition text-slate-300"
               >
                 <Plus size={20} />
               </button>
            )}
         </div>

         <div className="flex items-center gap-4">
            {isHost && (
              <button 
                onClick={() => ws?.send(JSON.stringify({ type: 'UPDATE_MODE', mode: roomState.mode === 'ONE_WAY' ? 'TWO_WAY' : 'ONE_WAY' }))}
                className={`p-3 rounded-xl transition shadow flex items-center gap-2 ${roomState.mode === 'TWO_WAY' ? 'bg-green-600/20 text-green-400 ring-1 ring-green-500/50' : 'bg-slate-700 text-slate-400'}`}
              >
                {roomState.mode === 'ONE_WAY' ? <ArrowRight size={20} /> : <ArrowLeftRight size={20} />}
              </button>
            )}
            
            <button 
              onClick={toggleMic}
              className={`p-4 rounded-full transition-all shadow-xl ${isMicActive ? 'bg-red-500 animate-pulse text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >
              {isMicActive ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Device Settings */}
        <div className="bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-700/50">
          <div className="flex items-center justify-between mb-6">
            <Settings size={28} className="text-slate-400" />
            <div className="flex gap-2">
               <button onClick={() => setAcousticMode('TELEPHONE')} className={`p-3 rounded-xl transition ${acousticMode === 'TELEPHONE' ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-slate-700'}`}><Smartphone size={20} /></button>
               <button onClick={() => setAcousticMode('HEADSET')} className={`p-3 rounded-xl transition ${acousticMode === 'HEADSET' ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-slate-700'}`}><Headphones size={20} /></button>
               <button onClick={() => { setAcousticMode('PRO_AV'); setShowSettings(!showSettings); }} className={`p-3 rounded-xl transition ${acousticMode === 'PRO_AV' ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-slate-700'}`}><Settings size={20} /></button>
            </div>
          </div>

          {(acousticMode === 'PRO_AV' || showSettings) && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
               <div className="flex items-center gap-4 bg-slate-900 p-3 rounded-xl">
                 <Mic size={20} className="text-slate-500" />
                 <select value={selectedInput} onChange={e => setSelectedInput(e.target.value)} className="bg-transparent flex-1 outline-none text-sm">
                   {audioDevices.inputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-slate-900">{d.label || 'Mic'}</option>)}
                 </select>
               </div>
               <div className="flex items-center gap-4 bg-slate-900 p-3 rounded-xl">
                 <Volume2 size={20} className="text-slate-500" />
                 <select value={selectedOutput} onChange={e => handleOutputChange(e.target.value)} className="bg-transparent flex-1 outline-none text-sm">
                   {audioDevices.outputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-slate-900">{d.label || 'Speaker'}</option>)}
                 </select>
               </div>
               {isHost && (
                 <button onClick={() => ws?.send(JSON.stringify({ type: 'TOGGLE_AEC', aecEnabled: !roomState.aecEnabled }))} 
                   className={`w-full p-3 rounded-xl flex justify-center items-center gap-2 transition ${roomState.aecEnabled ? 'bg-slate-700 text-blue-400' : 'bg-slate-900 text-slate-500 hover:bg-slate-800'}`}>
                   <ShieldAlert size={20} /> {roomState.aecEnabled ? 'AEC ON' : 'AEC OFF'}
                 </button>
               )}
            </div>
          )}
        </div>

        {/* QR & Users */}
        <div className="bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-700/50 flex flex-col items-center">
            <div className="bg-white p-3 rounded-2xl shadow-xl hover:scale-105 transition-transform">
               <QRCode value={`${window.location.protocol}//${window.location.host}/room/${roomId}`} size={160} />
            </div>
            
            <div className="mt-8 w-full">
              <div className="flex justify-between items-center mb-4 text-slate-400">
                <Users size={20} />
                <span className="font-mono">{clients.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {clients.map(c => (
                  <div key={c.id} className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full shadow-inner border border-slate-800">
                    <span className="text-sm font-medium">{c.name} {c.role === 'HOST' && '👑'}</span>
                    <span className="text-lg leading-none">{LANGUAGE_FLAGS[c.targetLanguage] || '🏳️'}</span>
                    {c.isSpeaking && <Mic size={14} className="text-blue-400 animate-pulse" />}
                  </div>
                ))}
              </div>
            </div>
        </div>

      </div>
    </div>
  );
}
