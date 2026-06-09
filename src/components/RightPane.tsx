import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCog, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { ClientData, Room } from '../types';
import { HostPanel } from './HostPanel';

interface RightPaneProps {
  roomState: Room;
  clients: ClientData[];
  me: ClientData;
  isMicActive: boolean;
  audioMuted: boolean;
  onToggleMic: () => void;
  onToggleAudio: () => void;
  ws: WebSocket | null;
  audioDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };
  selectedInput: string;
  selectedOutput: string;
  onSelectInput: (id: string) => void;
  onSelectOutput: (id: string) => void;
  onSetName: (name: string, role: 'HOST' | 'PARTICIPANT') => void;
}

export function RightPane({
  roomState,
  clients,
  me,
  isMicActive,
  audioMuted,
  onToggleMic,
  onToggleAudio,
  ws,
  audioDevices,
  selectedInput,
  selectedOutput,
  onSelectInput,
  onSelectOutput,
  onSetName
}: RightPaneProps) {
  const [showHostPanel, setShowHostPanel] = useState(false);

  return (
    <div className="w-full h-full bg-slate-900 border-l border-white/5 flex flex-col p-6">
       {/* Top Menu Buttons */}
       <div className="flex items-center justify-center gap-6 mb-12">
          
          <button 
             onClick={() => setShowHostPanel(true)}
             className={`w-16 h-16 rounded-[2rem] flex items-center justify-center transition-all ${showHostPanel || me.role === 'HOST' ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
             <UserCog size={28} />
          </button>

          <button 
             onClick={onToggleMic}
             className={`w-16 h-16 rounded-[2rem] flex items-center justify-center transition-all shadow-xl ${isMicActive ? 'bg-red-500 animate-pulse text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
             {isMicActive ? <Mic size={28} /> : <MicOff size={28} />}
          </button>

          <button 
             onClick={onToggleAudio}
             className={`w-16 h-16 rounded-[2rem] flex items-center justify-center transition-all ${audioMuted ? 'bg-orange-500/20 text-orange-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'}`}
          >
             {audioMuted ? <VolumeX size={28} /> : <Volume2 size={28} />}
          </button>
       </div>

       {/* Content Area - The Cube */}
       <div className="flex-1 relative flex items-center justify-center" style={{ perspective: '1200px' }}>
          <AnimatePresence mode="popLayout">
             {showHostPanel ? (
                <motion.div
                  key="HOST"
                  initial={{ rotateY: 90, opacity: 0, scale: 0.9 }}
                  animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                  exit={{ rotateY: -90, opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute inset-0 bg-slate-800/80 backdrop-blur-2xl border border-slate-700/50 rounded-[3rem] shadow-2xl p-8 flex flex-col"
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
                      onSelectInput={onSelectInput}
                      onSelectOutput={onSelectOutput}
                      onSetName={onSetName}
                   />
                </motion.div>
             ) : (
                <motion.div
                  key="EMPTY"
                  initial={{ rotateY: -90, opacity: 0, scale: 0.9 }}
                  animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                  exit={{ rotateY: 90, opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none"
                >
                   {/* Background decoration or logo */}
                   <div className="w-64 h-64 border-4 border-slate-800 rounded-[4rem] rotate-45 flex items-center justify-center">
                      <div className="w-32 h-32 border-4 border-slate-800 rounded-[2rem] -rotate-45" />
                   </div>
                </motion.div>
             )}
          </AnimatePresence>
       </div>
    </div>
  );
}
