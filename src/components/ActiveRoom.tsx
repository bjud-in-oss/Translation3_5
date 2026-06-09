import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Languages, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, UserCog, Mic, MicOff, Headphones, Phone } from 'lucide-react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';
import { ClientData, ControlMessage, Room } from '../types';
import { AudioManager } from '../lib/audioManager';
import { LANGUAGES } from '../data';

import churchImg from '../assets/images/church_meeting_1781028220295.png';
import classroomImg from '../assets/images/classroom_1781028236974.png';
import conferenceImg from '../assets/images/conference_room_1781033040204.png';

import { HostPanel } from './HostPanel';

export function ActiveRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomState, setRoomState] = useState<Room | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [me, setMe] = useState<ClientData | null>(null);
  
  // UI State
  const [activePanel, setActivePanel] = useState<'MAIN' | 'LANG_PICKER' | 'HOST_PANEL'>('MAIN');
  const [audioMuted, setAudioMuted] = useState(true); // Default muted per spec
  const [outputType, setOutputType] = useState<'HEADPHONES' | 'PHONE'>('HEADPHONES');
  const [recentLangs, setRecentLangs] = useState<string[]>(() => {
     try { return JSON.parse(localStorage.getItem('recentLangs') || '[]'); } catch { return []; }
  });
  
  // Hardware State
  const [isMicActive, setIsMicActive] = useState(false); // Default muted
  const [audioDevices, setAudioDevices] = useState<{inputs: MediaDeviceInfo[], outputs: MediaDeviceInfo[]}>({inputs: [], outputs: []});
  const [selectedInput, setSelectedInput] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<string>('');

  const audioManager = useRef<AudioManager>(new AudioManager());
  const [transcriptions, setTranscriptions] = useState<string>('');
  const [showApiModal, setShowApiModal] = useState(false);
  const [customApiInput, setCustomApiInput] = useState('');

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
         const savedLang = localStorage.getItem('savedLanguage');
         const savedApi = localStorage.getItem('customApiKey');
         if (savedApi) {
            socket.send(JSON.stringify({ type: 'SET_API_KEY', apiKey: savedApi }));
         }
         if (savedLang) {
           socket.send(JSON.stringify({ type: 'SET_LANGUAGE', language: savedLang }));
         }
      };

      socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ROOM_STATE') {
            setRoomState(msg.room);
            setClients(msg.clients);
            
            const savedNameStr = localStorage.getItem('savedName');
            const myData = msg.clients.find(c => savedNameStr ? c.name === savedNameStr : c.role === 'LISTENER' && c.name === null);
            if (myData) setMe(myData);
          } else if (msg.type === 'ERROR') {
             navigate('/');
          } else if (msg.type === 'AUDIO') {
             const binaryStr = window.atob(msg.audio);
             const len = binaryStr.length;
             const bytes = new Uint8Array(len);
             for (let i = 0; i < len; i++) {
                 bytes[i] = binaryStr.charCodeAt(i);
             }
             if (!audioMuted) {
                 audioManager.current.playPCM24(bytes.buffer);
             }
          } else if (msg.type === 'TRANSCRIPTION') {
             setTranscriptions(prev => {
                const combined = prev + msg.text;
                // keep the last 500 characters so it doesn't get infinitely long
                return combined.length > 500 ? combined.substring(combined.length - 500) : combined;
             });
          } else if (msg.type === 'API_KEY_REQUIRED') {
             setShowApiModal(true);
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
             targetLanguage: localStorage.getItem('savedLanguage') || null,
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

  const handleSelectLanguage = (code: string) => {
     setTranscriptions('');
     const newRecents = [code, ...recentLangs.filter(l => l !== code)].slice(0, 5);
     setRecentLangs(newRecents);
     localStorage.setItem('recentLangs', JSON.stringify(newRecents));
     localStorage.setItem('savedLanguage', code);
     
     ws?.send(JSON.stringify({ type: 'SET_LANGUAGE', language: code }));
     setActivePanel('MAIN');
  };

  const currentId = parseInt(roomId || '1');
  const navigatePrev = () => navigate('/room/' + (currentId === 1 ? 3 : currentId - 1));
  const navigateNext = () => navigate('/room/' + (currentId === 3 ? 1 : currentId + 1));

  const getImageForRoom = () => {
    if (roomId === '1') return churchImg;
    if (roomId === '2') return classroomImg;
    if (roomId === '3') return conferenceImg;
    return classroomImg;
  };

  if (!roomState || !me) {
    return <div className="flex h-screen w-screen bg-slate-950 items-center justify-center"><Languages size={48} className="animate-spin text-slate-800" /></div>;
  }

  // Find who is currently speaking (for the translation dim effect)
  const isSomeoneSpeaking = clients.some(c => c.isSpeaking);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden flex bg-slate-950 text-slate-200">
       <img src={getImageForRoom()} className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${!audioMuted && isSomeoneSpeaking ? 'opacity-20 blur-sm scale-110 z-0' : 'opacity-50 scale-100 z-0'}`} alt="" />
       <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none z-0" />
       
       {/* Navigation Edge Overlays */}
       <button onClick={navigatePrev} className="absolute z-30 portrait:top-0 portrait:inset-x-0 portrait:h-16 portrait:w-full landscape:left-0 landscape:inset-y-0 landscape:w-20 landscape:h-full bg-slate-950/40 hover:bg-slate-950/70 border-b portrait:border-b-white/5 landscape:border-r landscape:border-r-white/5 flex items-center justify-center transition-colors group backdrop-blur-sm">
          <ChevronUp className="hidden portrait:block text-slate-500 group-hover:text-white transition-colors" size={32} />
          <ChevronLeft className="hidden landscape:block text-slate-500 group-hover:text-white transition-colors" size={44} />
       </button>
       <button onClick={navigateNext} className="absolute z-30 portrait:bottom-0 portrait:inset-x-0 portrait:h-16 portrait:w-full landscape:right-0 landscape:inset-y-0 landscape:w-20 landscape:h-full bg-slate-950/40 hover:bg-slate-950/70 border-t portrait:border-t-white/5 landscape:border-l landscape:border-l-white/5 flex items-center justify-center transition-colors group backdrop-blur-sm">
          <ChevronDown className="hidden portrait:block text-slate-500 group-hover:text-white transition-colors" size={32} />
          <ChevronRight className="hidden landscape:block text-slate-500 group-hover:text-white transition-colors" size={44} />
       </button>

       {/* Floating Corner Buttons */}
       <div className="absolute z-50 portrait:top-1 portrait:left-4 landscape:top-4 landscape:left-3">
           <button 
              onClick={() => setActivePanel(activePanel === 'LANG_PICKER' ? 'MAIN' : 'LANG_PICKER')}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl border relative ${me.targetLanguage || activePanel === 'LANG_PICKER' ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-slate-800/90 backdrop-blur text-slate-400 hover:bg-slate-700 hover:text-white border-white/10'}`}
           >
              {me.targetLanguage ? (
                 <span className="font-bold uppercase tracking-wider z-10 text-lg">{me.targetLanguage.substring(0, 2)}</span>
              ) : (
                 <>
                   <Languages size={24} />
                   <div className="absolute bottom-1 right-1 bg-blue-500 rounded-full w-4 h-4 flex items-center justify-center shadow-lg border border-slate-800 z-10">
                     <Plus size={10} className="text-white relative z-10" />
                   </div>
                 </>
              )}
           </button>
       </div>

       {(roomState.mode === 'TWO_WAY' || me.role === 'HOST') && (
         <div className="absolute z-50 portrait:top-1 portrait:right-4 landscape:top-4 landscape:right-3">
             <button 
                onClick={toggleMic}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl border relative ${isMicActive ? 'bg-red-500 text-white border-red-400' : 'bg-slate-800/90 backdrop-blur text-slate-400 hover:bg-slate-700 hover:text-white border-white/10'}`}
             >
                {isMicActive ? <Mic size={24} className="animate-pulse" /> : <MicOff size={24} />}
             </button>
         </div>
       )}

       <div className="absolute z-50 portrait:bottom-1 portrait:left-4 landscape:bottom-4 landscape:left-3">
           <button 
              onClick={() => setActivePanel(activePanel === 'HOST_PANEL' ? 'MAIN' : 'HOST_PANEL')}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl border ${activePanel === 'HOST_PANEL' || me.role === 'HOST' ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-slate-800/90 backdrop-blur text-slate-400 hover:bg-slate-700 hover:text-white border-white/10'}`}
           >
              <UserCog size={24} />
           </button>
       </div>

       <div className="absolute z-50 portrait:bottom-1 portrait:right-4 landscape:bottom-4 landscape:right-3 flex gap-3">
           <button 
              onClick={() => setAudioMuted(!audioMuted)}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl border relative bg-slate-800/90 backdrop-blur hover:bg-slate-700 hover:text-white border-white/10 ${audioMuted ? 'text-slate-500' : 'text-green-400 border-green-500/30'}`}
           >
              {outputType === 'HEADPHONES' ? <Headphones size={24} /> : <Phone size={24} className="scale-x-[-1]" />}
              {audioMuted && <div className="absolute w-[36px] h-[3px] bg-slate-400 rounded-full rotate-45 border-[1px] border-slate-900 pointer-events-none z-10" />}
           </button>
       </div>

       {/* Central Box */}
       <div className="absolute z-20 inset-0 portrait:py-16 portrait:px-4 landscape:px-20 landscape:py-6 flex items-stretch justify-center h-full w-full pointer-events-none">
          <div className="w-full max-w-5xl h-full flex flex-col relative pointer-events-auto" style={{ perspective: '1200px' }}>
             <AnimatePresence mode="wait">
                {activePanel === 'LANG_PICKER' && (
                   <motion.div
                      key="LANG_PICKER"
                      initial={{ rotateY: 90, opacity: 0, scale: 0.95 }}
                      animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                      exit={{ rotateY: -90, opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute inset-0 bg-slate-900/90 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-2xl p-6 md:p-12 flex flex-col overflow-hidden"
                      style={{ transformStyle: 'preserve-3d' }}
                   >
                      <div className="flex items-center gap-4 mb-6 md:mb-8 text-white">
                         <Languages size={32} className="text-blue-400" />
                         <h2 className="text-2xl md:text-3xl font-semibold">Select Language</h2>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-4 pr-2 md:pr-4 custom-scrollbar">
                         {/* Recents */}
                         {recentLangs.length > 0 && (
                            <div className="mb-6 md:mb-8">
                               <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Recent</div>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {recentLangs.map(code => (
                                     <button 
                                        key={`recent-${code}`} 
                                        onClick={() => handleSelectLanguage(code)}
                                        className={`w-full text-left px-5 py-4 rounded-2xl flex items-center justify-between transition-all ${me.targetLanguage === code ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'}`}
                                     >
                                        <span className="font-medium text-base md:text-lg">{LANGUAGES[code as keyof typeof LANGUAGES]}</span>
                                        <span className="text-sm opacity-50 uppercase">{code}</span>
                                     </button>
                                  ))}
                               </div>
                            </div>
                         )}
                         
                         {/* All */}
                         <div className="pb-8">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">All Languages</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                               {Object.entries(LANGUAGES).filter(([code]) => !recentLangs.includes(code)).map(([code, name]) => (
                                  <button 
                                     key={code} 
                                     onClick={() => handleSelectLanguage(code)}
                                     className="w-full text-left px-5 py-4 rounded-2xl flex items-center justify-between transition-all bg-slate-800/80 hover:bg-slate-700 text-slate-300"
                                  >
                                     <span className="font-medium text-base md:text-lg">{name}</span>
                                     <span className="text-sm opacity-50 uppercase">{code}</span>
                                  </button>
                               ))}
                            </div>
                         </div>
                      </div>
                   </motion.div>
                )}
                
                {activePanel === 'HOST_PANEL' && (
                   <motion.div
                      key="HOST_PANEL"
                      initial={{ rotateY: 90, opacity: 0, scale: 0.95 }}
                      animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                      exit={{ rotateY: -90, opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute inset-0 bg-slate-900/90 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-2xl p-6 md:p-12 flex flex-col overflow-hidden"
                      style={{ transformStyle: 'preserve-3d' }}
                   >
                      <HostPanel 
                         roomState={roomState}
                         clients={clients}
                         me={me}
                         ws={ws}
                         audioDevices={audioDevices}
                         selectedInput={selectedInput}
                         selectedOutput={selectedOutput}
                         onSelectInput={setSelectedInput}
                         onSelectOutput={(out) => { setSelectedOutput(out); audioManager.current.setOutputDevice(out); }}
                         onSetName={handleSetName}
                      />
                   </motion.div>
                )}
                
                {activePanel === 'MAIN' && (
                   <motion.div
                      key="MAIN"
                      initial={{ rotateY: -90, opacity: 0, scale: 0.95 }}
                      animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                      exit={{ rotateY: 90, opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className={`absolute inset-0 flex flex-col rounded-[2.5rem] overflow-hidden transition-all duration-700 pointer-events-auto ${!audioMuted ? 'bg-transparent' : 'bg-slate-900/50 backdrop-blur-3xl border border-white/10 shadow-2xl'}`}
                      style={{ transformStyle: 'preserve-3d' }}
                   >
                      {audioMuted ? (
                         <div className="h-full w-full overflow-y-auto custom-scrollbar flex flex-col landscape:flex-row items-center justify-center p-6 md:p-8 landscape:gap-12 portrait:gap-8">
                            <div className="relative bg-white pt-6 pb-6 px-6 md:pt-10 md:pb-10 md:px-10 rounded-[2.5rem] shadow-2xl shadow-black/60 border border-slate-300 transform md:scale-100 scale-90 flex-shrink-0">
                               <QRCode value={`${window.location.protocol}//${window.location.host}/room/${currentId}`} size={Math.min(window.innerWidth * 0.45, 260)} />
                            </div>

                            {/* Output Mode Switcher */}
                            <div className="flex flex-row landscape:flex-col bg-slate-950/60 backdrop-blur-md rounded-full p-2 border border-white/10 shadow-inner flex-shrink-0 gap-2">
                               <button 
                                 onClick={() => setOutputType('HEADPHONES')} 
                                 className={`flex items-center justify-center p-4 rounded-full transition-all ${outputType === 'HEADPHONES' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                               >
                                 <Headphones size={28} />
                               </button>
                               <button 
                                 onClick={() => setOutputType('PHONE')} 
                                 className={`flex items-center justify-center p-4 rounded-full transition-all ${outputType === 'PHONE' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                               >
                                 <Phone size={28} className="scale-x-[-1]" />
                               </button>
                            </div>
                         </div>
                      ) : (
                         <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 lg:p-16 text-shadow-xl z-20 pointer-events-none" style={{ textShadow: '0 4px 30px rgba(0,0,0,1)' }}>
                            {isSomeoneSpeaking && (
                               <div className="flex items-center gap-3 mb-6">
                                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-[0_0_12px_rgba(74,222,128,1)]" />
                                  <span className="text-green-400 text-sm font-bold tracking-widest uppercase">Live Translation Active</span>
                               </div>
                            )}
                            <p className="text-3xl md:text-5xl lg:text-7xl font-semibold text-white leading-tight tracking-tight max-w-4xl drop-shadow-2xl">
                               {transcriptions ? transcriptions : (me.targetLanguage ? `The requested real-time content translation will be streamed here in ${LANGUAGES[me.targetLanguage as keyof typeof LANGUAGES]}...` : 'Select a language to see real-time translated captions.')}
                            </p>
                         </div>
                      )}
                   </motion.div>
                )}
             </AnimatePresence>
          </div>
       </div>

       {/* API Key Modal */}
       <AnimatePresence>
          {showApiModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div 
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.95 }}
                   className="bg-slate-900 border border-slate-700 p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full"
                >
                   <h2 className="text-2xl font-bold text-white mb-4">Demo Expired</h2>
                   <p className="text-slate-400 mb-6">
                      Your 15-minute demo session has expired. To continue translating, please provide your own Gemini API key. It will be stored locally in your browser.
                   </p>
                   <input
                      type="password"
                      value={customApiInput}
                      onChange={e => setCustomApiInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all mb-6"
                   />
                   <div className="flex gap-4">
                      <button 
                         onClick={() => {
                            if (customApiInput.trim()) {
                               localStorage.setItem('customApiKey', customApiInput.trim());
                               ws?.send(JSON.stringify({ type: 'SET_API_KEY', apiKey: customApiInput.trim() }));
                               setShowApiModal(false);
                            }
                         }}
                         className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition shadow-lg shadow-blue-500/20"
                      >
                         Continue
                      </button>
                   </div>
                </motion.div>
             </div>
          )}
       </AnimatePresence>
    </div>
  );
}

