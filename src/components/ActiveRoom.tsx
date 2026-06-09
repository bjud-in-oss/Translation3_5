import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Settings, Users, Radio, ArrowLeftRight, ArrowRight, Volume2, Plus, Languages, VolumeX, ShieldAlert, MonitorSpeaker, ScanQrCode, X } from 'lucide-react';
import { ClientData, ControlMessage, Room } from '../types';
import { AudioManager } from '../lib/audioManager';
import { LANGUAGES } from '../data';

import churchImg from '../assets/images/church_meeting_1781028220295.png';
import classroomImg from '../assets/images/classroom_1781028236974.png';

// Faces of the cube
type CubeFace = 'QR' | 'PARTICIPANTS' | 'ADVANCED' | 'ROOMS';

export function ActiveRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomState, setRoomState] = useState<Room | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [me, setMe] = useState<ClientData | null>(null);
  
  // UI State
  const [activeFace, setActiveFace] = useState<CubeFace>('QR');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<'MIC' | 'HOST' | 'PRO' | null>(null);
  const [tempName, setTempName] = useState(localStorage.getItem('savedName') || '');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  
  // Hardware State
  const [isMicActive, setIsMicActive] = useState(false);
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
            // find ourselves (since id is assigned by server and we don't know it, we just match but actually we can check our own identity via response)
            // Wait, standard WS doesn't easily return assigned clientID on JOIN unless we echo. 
            // Better: just pick the client with matching name. If no name yet, we might be the only 'LISTENER' with no name? No, others can be. 
            // We'll rely on the server giving us an ID eventually or matching name. For now, match by name if we have one.
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
      
      socket.onerror = () => navigate('/');
    } catch(e) { navigate('/'); }

    return () => {
      if (socket) socket.close();
      audioManager.current.stopCapture();
    };
  }, [roomId, navigate, audioMuted]);

  const requireName = (intent: 'MIC' | 'HOST' | 'PRO') => {
    if (!me?.name) {
      setPendingIntent(intent);
      setNameModalOpen(true);
      return false;
    }
    return true;
  };

  const submitName = () => {
    if (!tempName.trim()) return;
    localStorage.setItem('savedName', tempName.trim());
    
    let requestedRole: 'HOST' | 'PARTICIPANT' = 'PARTICIPANT';
    if (pendingIntent === 'HOST') requestedRole = 'HOST';
    
    ws?.send(JSON.stringify({ type: 'SET_NAME', name: tempName.trim(), role: requestedRole }));
    setNameModalOpen(false);
    
    // Execute pending intent after a tiny delay to state settle
    setTimeout(() => {
      if (pendingIntent === 'MIC') toggleMic();
      else if (pendingIntent === 'PRO') setActiveFace('ADVANCED');
    }, 100);
  };

  const toggleMic = async () => {
    if (!requireName('MIC')) return;
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
        // Silently fails visual toggle but standard permission log
      }
    }
  };

  const isHost = me?.role === 'HOST';
  const hasHost = roomState?.hostConnected;

  if (!roomState || !me) {
    return <div className="flex h-screen bg-slate-900 items-center justify-center"><Languages size={48} className="animate-spin text-slate-500 opacity-20" /></div>;
  }

  return (
    <div className="h-screen bg-slate-900 flex flex-col font-sans overflow-hidden text-slate-200">
      
      {/* Top Bar Navigation */}
      <div className="h-20 shrink-0 border-b border-slate-800 px-6 flex items-center justify-between z-20 bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
           {roomState.hostConnected && roomState.adminName ? (
              <div className="flex items-center gap-3">
                 <img src={roomState.type === 'CHURCH' ? churchImg : classroomImg} className="w-12 h-12 rounded-full object-cover border-2 border-slate-700" alt="" />
                 <div>
                   <div className="font-semibold">{roomState.name}</div>
                   <div className="text-xs text-slate-400 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                      Host: {roomState.adminName}
                   </div>
                 </div>
              </div>
           ) : (
             <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full border-2 border-slate-800 bg-slate-800 flex items-center justify-center">
                   <Languages size={20} className="text-slate-600" />
                </div>
                <div>
                   <div className="font-semibold text-slate-400">{roomState.name}</div>
                   <div className="text-xs text-slate-500">No host active</div>
                </div>
             </div>
           )}
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-4">
          
           {isHost && (
              <button 
                onClick={() => ws?.send(JSON.stringify({ type: 'UPDATE_MODE', mode: roomState.mode === 'ONE_WAY' ? 'TWO_WAY' : 'ONE_WAY' }))}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${roomState.mode === 'TWO_WAY' ? 'bg-green-600/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
              >
                {roomState.mode === 'ONE_WAY' ? <ArrowRight size={20} /> : <ArrowLeftRight size={20} />}
              </button>
           )}

           {!hasHost && roomState.adminId === null && (
              <button onClick={() => requireName('HOST')} className="px-4 h-12 bg-blue-600 hover:bg-blue-500 rounded-full font-medium transition-all shadow-lg flex items-center gap-2">
                 Become Host
              </button>
           )}

           <button 
             onClick={() => setAudioMuted(!audioMuted)}
             className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${audioMuted ? 'bg-red-500/20 text-red-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
           >
              {audioMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
           </button>

           {(isHost || (roomState.mode === 'TWO_WAY' && me?.name)) && (
             <button 
               onClick={toggleMic}
               className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl ${isMicActive ? 'bg-red-500 animate-pulse text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
             >
               {isMicActive ? <Mic size={20} /> : <MicOff size={20} />}
             </button>
           )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Left half: Translated Text area (Placeholder) */}
        <div className="flex-1 border-r border-slate-800 bg-slate-900/50 p-8 flex flex-col">
           <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                 <div className="flex flex-col">
                    {/* Language Selection Row */}
                    <div className="flex gap-2 mb-2">
                       {roomState.activeLanguages.map(langCode => (
                          <button
                            key={langCode}
                            onClick={() => {
                               if (!me.name) requireName('MIC'); // Just to prompt name if totally anon. Actually let them change lang anon.
                               ws?.send(JSON.stringify({ type: 'SET_LANGUAGE', language: langCode }));
                            }}
                            className={`px-4 py-2 rounded-full font-medium text-sm border transition-all ${me.targetLanguage === langCode ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                          >
                            {LANGUAGES[langCode]}
                          </button>
                       ))}
                       
                       <div className="relative">
                          <button 
                            onClick={() => setShowLanguagePicker(!showLanguagePicker)}
                            className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 flex items-center justify-center transition"
                          >
                            <Plus size={18} />
                          </button>
                          
                          {showLanguagePicker && (
                            <div className="absolute top-12 left-0 w-64 max-h-96 overflow-y-auto bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 z-50 p-2">
                              {Object.entries(LANGUAGES).map(([code, name]) => (
                                <button 
                                  key={code}
                                  onClick={() => {
                                     ws?.send(JSON.stringify({ type: 'ADD_LANGUAGE', language: code }));
                                     setShowLanguagePicker(false);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-slate-700 rounded-lg text-sm text-slate-300"
                                >
                                  {name}
                                </button>
                              ))}
                            </div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
              <Languages size={32} className="text-slate-700" />
           </div>
           
           {/* Text Stream placeholder */}
           <div className="flex-1 overflow-y-auto font-medium text-xl leading-relaxed text-slate-400 flex flex-col justify-end pb-12 gap-8 mask-fade-top opacity-50">
             <p className="translate-text">The translated text will stream here in real-time as the host speaks.</p>
             <p className="translate-text text-white opacity-100">Make sure to select your language above to listen to the interpretation and see captions.</p>
           </div>
        </div>

        {/* Right half: The "Cube" UI */}
        <div className="flex-1 flex items-center justify-center relative bg-gradient-to-tr from-slate-950 to-slate-900">
           
           {/* Side selectors to rotate cube */}
           <div className="absolute left-8 flex flex-col gap-4 z-20">
              {[
                { id: 'QR', icon: ScanQrCode },
                { id: 'PARTICIPANTS', icon: Users },
                { id: 'ADVANCED', icon: Settings, action: () => requireName('PRO') },
                { id: 'ROOMS', icon: MonitorSpeaker } // Generic rooms/presentation icon
              ].map(face => (
                <button 
                  key={face.id}
                  onClick={() => { if (face.action) face.action(); else setActiveFace(face.id as CubeFace); }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${activeFace === face.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                >
                  <face.icon size={24} />
                </button>
              ))}
           </div>

           {/* The Cube container */}
           <div className="relative w-full max-w-md aspect-square mx-auto ml-24" style={{ perspective: '1200px' }}>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={activeFace}
                  initial={{ rotateY: 90, opacity: 0, scale: 0.9 }}
                  animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                  exit={{ rotateY: -90, opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute inset-0 bg-slate-800/80 backdrop-blur-2xl border border-slate-700/50 rounded-3xl shadow-2xl p-8 flex flex-col"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                   {activeFace === 'QR' && (
                     <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <div className="bg-white p-4 rounded-3xl mb-8 shadow-xl">
                          <QRCode value={`${window.location.protocol}//${window.location.host}/room/${roomId}`} size={200} />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">Scan to Join</h3>
                        <p className="text-slate-400 text-sm">Anyone scanning this code will instantly join the {roomState.name} room.</p>
                     </div>
                   )}

                   {activeFace === 'PARTICIPANTS' && (
                     <div className="flex-1 flex flex-col">
                        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2"><Users className="text-blue-400"/> Participants ({clients.length})</h3>
                        <div className="overflow-y-auto space-y-3 flex-1 pr-2">
                          {clients.map(c => (
                            <div key={c.id} className="bg-slate-900/50 p-4 rounded-2xl flex items-center justify-between">
                               <div className="flex justify-between items-center gap-3">
                                  <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-400">
                                     {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                                  </div>
                                  <span className="font-medium">{c.name || 'Anonymous'}</span>
                               </div>
                               <div className="flex items-center gap-3">
                                 {c.targetLanguage && <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">{LANGUAGES[c.targetLanguage]?.split(' ')[0]}</span>}
                                 {c.isSpeaking && <Mic size={16} className="text-green-400 animate-pulse" />}
                               </div>
                            </div>
                          ))}
                        </div>
                     </div>
                   )}

                   {activeFace === 'ADVANCED' && (
                     <div className="flex-1 flex flex-col">
                         <h3 className="text-xl font-semibold mb-6 flex items-center gap-2"><Settings className="text-blue-400"/> Pro AV Input/Output</h3>
                         
                         <div className="space-y-6">
                           <div>
                             <label className="text-sm font-medium text-slate-400 mb-2 block">Audio Input Source</label>
                             <div className="bg-slate-900 rounded-xl p-1">
                               <select value={selectedInput} onChange={e => setSelectedInput(e.target.value)} className="w-full bg-transparent p-3 outline-none appearance-none">
                                 {audioDevices.inputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Default Microphone'}</option>)}
                               </select>
                             </div>
                           </div>
                           
                           <div>
                             <label className="text-sm font-medium text-slate-400 mb-2 block">Audio Output Destination</label>
                             <div className="bg-slate-900 rounded-xl p-1">
                               <select value={selectedOutput} onChange={e => { setSelectedOutput(e.target.value); audioManager.current.setOutputDevice(e.target.value); }} className="w-full bg-transparent p-3 outline-none appearance-none">
                                 {audioDevices.outputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'System Default'}</option>)}
                               </select>
                             </div>
                           </div>

                           {isHost && (
                             <button 
                               onClick={() => ws?.send(JSON.stringify({ type: 'TOGGLE_AEC', aecEnabled: !roomState.aecEnabled }))} 
                               className={`w-full p-4 rounded-xl flex justify-center items-center gap-2 transition font-medium ${roomState.aecEnabled ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20' : 'bg-slate-900 text-slate-500'}`}
                             >
                               <ShieldAlert size={20} /> {roomState.aecEnabled ? 'Echo Cancellation ACTIVE' : 'Echo Cancellation DISABLED'}
                             </button>
                           )}
                         </div>
                     </div>
                   )}

                   {activeFace === 'ROOMS' && (
                     <div className="flex-1 flex flex-col">
                         <h3 className="text-xl font-semibold mb-6 flex items-center gap-2"><MonitorSpeaker className="text-blue-400"/> Quick Switch</h3>
                         <div className="space-y-4">
                            <button onClick={()=> navigate('/room/1')} className="w-full text-left p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl transition flex items-center gap-4">
                               <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-500">1</div>
                               <div><div className="font-medium">Church Hall</div><div className="text-xs text-slate-500">Room 1</div></div>
                            </button>
                            <button onClick={()=> navigate('/room/2')} className="w-full text-left p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl transition flex items-center gap-4">
                               <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-500">2</div>
                               <div><div className="font-medium">Language Resource Rm</div><div className="text-xs text-slate-500">Room 2</div></div>
                            </button>
                            <button onClick={()=> navigate('/room/3')} className="w-full text-left p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl transition flex items-center gap-4">
                               <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-500">3</div>
                               <div><div className="font-medium">Study Group</div><div className="text-xs text-slate-500">Room 3</div></div>
                            </button>
                         </div>
                     </div>
                   )}
                </motion.div>
              </AnimatePresence>
           </div>

        </div>
      </div>

      {/* Name Input Modal */}
      <AnimatePresence>
        {nameModalOpen && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
           >
              <motion.div 
                initial={{ y: 50, scale: 0.9 }} animate={{ y: 0, scale: 1 }} exit={{ y: 50, scale: 0.9 }}
                className="bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full border border-slate-700"
              >
                 <div className="flex justify-between items-start mb-6">
                   <h2 className="text-2xl font-semibold">Identify</h2>
                   <button onClick={() => setNameModalOpen(false)} className="text-slate-500 hover:text-slate-300"><X size={24}/></button>
                 </div>
                 <p className="text-slate-400 mb-6 leading-relaxed">Please state your name to participate actively in the {roomState.name}.</p>
                 
                 <input 
                   autoFocus
                   type="text" 
                   value={tempName}
                   onChange={e => setTempName(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && submitName()}
                   placeholder="Your name"
                   className="w-full bg-slate-900 border-2 border-slate-700/50 rounded-xl px-5 py-4 text-lg text-white mb-6 outline-none focus:border-blue-500 transition-colors"
                 />
                 
                 <button onClick={submitName} className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-medium text-lg transition-colors">
                    Join Session
                 </button>
              </motion.div>
           </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .mask-fade-top {
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%);
          mask-image: linear-gradient(to bottom, transparent 0%, black 15%);
        }
      `}</style>
    </div>
  );
}
