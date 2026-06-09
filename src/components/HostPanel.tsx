import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Settings, ArrowRight, ArrowLeftRight, ShieldAlert, Mic, UserCog, MonitorSmartphone } from 'lucide-react';
import { ClientData, Room } from '../types';
import { LANGUAGES } from '../data';

interface HostPanelProps {
  roomState: Room;
  clients: ClientData[];
  me: ClientData;
  ws: WebSocket | null;
  audioDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };
  selectedInput: string;
  selectedOutput: string;
  onSelectInput: (id: string) => void;
  onSelectOutput: (id: string) => void;
  onSetName: (name: string, role: 'HOST' | 'PARTICIPANT') => void;
}

export function HostPanel({
  roomState,
  clients,
  me,
  ws,
  audioDevices,
  selectedInput,
  selectedOutput,
  onSelectInput,
  onSelectOutput,
  onSetName
}: HostPanelProps) {
  const [internalFace, setInternalFace] = useState<'LOGIN' | 'MAIN' | 'PRO'>('LOGIN');
  const [tempName, setTempName] = useState(me.name || localStorage.getItem('savedName') || '');

  useEffect(() => {
     if (me.name) {
        setInternalFace('MAIN');
     }
  }, [me.name]);

  const handleSubmitName = () => {
     if (tempName.trim()) {
        onSetName(tempName.trim(), 'HOST');
        setInternalFace('MAIN');
     }
  };

  const isHost = me.role === 'HOST';

  return (
    <div className="w-full h-full relative flex flex-col" style={{ perspective: '1200px' }}>
       {/* Small menu inside Host Panel */}
       {me.name && (
          <div className="flex justify-center gap-4 z-20 mb-6 shrink-0">
             <button 
                onClick={() => setInternalFace('MAIN')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${internalFace === 'MAIN' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
             >
                <Users size={16} /> Dashboard
             </button>
             <button 
                onClick={() => setInternalFace('PRO')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${internalFace === 'PRO' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
             >
                <Settings size={16} /> Advanced AV
             </button>
          </div>
       )}

       <AnimatePresence mode="popLayout">
          {internalFace === 'LOGIN' && (
             <motion.div
                key="LOGIN"
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                exit={{ rotateX: -90, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute inset-0 flex flex-col justify-center items-center text-center p-6"
                style={{ transformStyle: 'preserve-3d' }}
             >
                <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mb-6 border border-blue-500/30">
                   <UserCog size={36} className="text-blue-400" />
                </div>
                <h3 className="text-2xl font-semibold mb-2">Host Identification</h3>
                <p className="text-slate-400 mb-8 max-w-sm">Enter your name to manage the conversation and toggle communication modes.</p>
                
                <input 
                  autoFocus
                  type="text" 
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmitName()}
                  placeholder="Your Name"
                  className="w-full max-w-xs bg-slate-900 border-2 border-slate-700 rounded-2xl px-6 py-4 text-xl text-center text-white mb-6 outline-none focus:border-blue-500 transition-colors"
                />
                
                <button 
                  onClick={handleSubmitName}
                  className="w-full max-w-xs bg-blue-600 hover:bg-blue-500 p-4 rounded-2xl font-semibold text-lg transition-colors shadow-lg shadow-blue-500/20"
                >
                   Acknowledge
                </button>
             </motion.div>
          )}

          {internalFace === 'MAIN' && (
             <motion.div
                key="MAIN"
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                exit={{ rotateX: -90, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute inset-0 flex flex-col"
                style={{ transformStyle: 'preserve-3d' }}
             >
                {isHost ? (
                   <div className="bg-slate-900/50 rounded-2xl p-4 flex items-center justify-between mb-6 border border-white/5">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                            <ShieldAlert size={20} className="text-green-500" />
                         </div>
                         <div>
                            <div className="font-semibold">{me.name}</div>
                            <div className="text-xs text-slate-400">Host Privileges Active</div>
                         </div>
                      </div>
                      
                      <button 
                        onClick={() => ws?.send(JSON.stringify({ type: 'UPDATE_MODE', mode: roomState.mode === 'ONE_WAY' ? 'TWO_WAY' : 'ONE_WAY' }))}
                        className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition ${roomState.mode === 'TWO_WAY' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400'}`}
                      >
                         {roomState.mode === 'ONE_WAY' ? <ArrowRight size={18} /> : <ArrowLeftRight size={18} />}
                         {roomState.mode === 'ONE_WAY' ? '1-Way' : '2-Way Open'}
                      </button>
                   </div>
                ) : (
                   <div className="bg-slate-900/50 rounded-2xl p-4 flex items-center gap-4 mb-6 border border-white/5">
                      <UserCog size={24} className="text-slate-500 shrink-0" />
                      <p className="text-sm text-slate-300 flex-1">View list of participants and channel capabilities.</p>
                      <button onClick={()=> onSetName(me.name!, 'HOST')} className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 rounded-xl text-blue-400 text-sm font-semibold transition whitespace-nowrap">
                         Become Host
                      </button>
                   </div>
                )}

                <h4 className="font-medium text-slate-400 mb-3 ml-2">Session Participants ({clients.length})</h4>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 pb-24 border-t border-white/5 pt-4">
                   {clients.map(c => (
                     <div key={c.id} className="bg-slate-900 p-4 rounded-2xl flex items-center justify-between border border-white/5 hover:border-white/10 transition">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-400">
                              {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                           </div>
                           <div>
                              <span className="font-medium flex items-center gap-2">
                                 {c.name || 'Anonymous listener'}
                                 {c.role === 'HOST' && <UserCog size={14} className="text-blue-400" />}
                              </span>
                              <div className="text-xs text-slate-500 mt-1">
                                 {c.targetLanguage ? LANGUAGES[c.targetLanguage] : 'Listening in original'} 
                              </div>
                           </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {c.isSpeaking && (
                             <div className="flex items-center gap-2 text-xs font-semibold text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full">
                                <Mic size={14} className="animate-pulse" /> Speaking
                             </div>
                          )}
                        </div>
                     </div>
                   ))}
                </div>
             </motion.div>
          )}

          {internalFace === 'PRO' && (
             <motion.div
                key="PRO"
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                exit={{ rotateX: -90, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute inset-0 flex flex-col"
                style={{ transformStyle: 'preserve-3d' }}
             >
                <div className="flex-1 bg-slate-900 rounded-[2rem] p-6 border border-white/5 space-y-8">
                   <div>
                     <label className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-3"><Mic size={16} /> Audio Input Hardware</label>
                     <div className="bg-slate-950 border border-slate-800 rounded-xl p-1 shadow-inner">
                       <select value={selectedInput} onChange={e => onSelectInput(e.target.value)} className="w-full bg-transparent p-4 outline-none appearance-none font-medium">
                         {audioDevices.inputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-slate-900">{d.label || 'Default System Microphone'}</option>)}
                       </select>
                     </div>
                   </div>
                   
                   <div>
                     <label className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-3"><MonitorSmartphone size={16} /> Audio Output Hardware</label>
                     <div className="bg-slate-950 border border-slate-800 rounded-xl p-1 shadow-inner">
                       <select value={selectedOutput} onChange={e => onSelectOutput(e.target.value)} className="w-full bg-transparent p-4 outline-none appearance-none font-medium">
                         {audioDevices.outputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-slate-900">{d.label || 'Default System Speaker'}</option>)}
                       </select>
                     </div>
                   </div>

                   {isHost && (
                     <div className="pt-4 border-t border-slate-800">
                        <button 
                          onClick={() => ws?.send(JSON.stringify({ type: 'TOGGLE_AEC', aecEnabled: !roomState.aecEnabled }))} 
                          className={`w-full p-5 rounded-2xl flex justify-center items-center gap-3 transition-all font-semibold ${roomState.aecEnabled ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'}`}
                        >
                          <ShieldAlert size={20} /> 
                          {roomState.aecEnabled ? 'AEC / Noise Suppression Active' : 'Enable AEC Processing'}
                        </button>
                        <p className="text-center text-xs text-slate-500 mt-4 leading-relaxed">
                           AEC (Acoustic Echo Cancellation) helps prevent feedback loops when using loudspeakers. Turn off for pure audio passthrough.
                        </p>
                     </div>
                   )}
                </div>
             </motion.div>
          )}
       </AnimatePresence>
    </div>
  );
}
