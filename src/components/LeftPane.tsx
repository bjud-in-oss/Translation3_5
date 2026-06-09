import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Languages, Plus, ScanQrCode, ChevronLeft, ChevronRight } from 'lucide-react';
import QRCode from 'react-qr-code';
import { LANGUAGES } from '../data';

import churchImg from '../assets/images/church_meeting_1781028220295.png';
import classroomImg from '../assets/images/classroom_1781028236974.png';
import conferenceImg from '../assets/images/conference_room_1781033040204.png';

interface LeftPaneProps {
  roomId: string;
  roomType: string;
  activeLanguages: string[];
  targetLanguage: string | null;
  onLanguageSelect: (lang: string) => void;
  onAddLanguage: (lang: string) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  hostSpeaking: boolean;
}

export function LeftPane({
  roomId,
  roomType,
  activeLanguages,
  targetLanguage,
  onLanguageSelect,
  onAddLanguage,
  onNavigatePrev,
  onNavigateNext,
  hostSpeaking
}: LeftPaneProps) {
  const [face, setFace] = useState<'STREAM' | 'QR'>('STREAM');
  const [showLangPicker, setShowLangPicker] = useState(false);

  const getImage = () => {
    if (roomId === '1') return churchImg;
    if (roomId === '2') return classroomImg;
    if (roomId === '3') return conferenceImg;
    return classroomImg;
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden flex perspective-[1200px]">
      
      {/* Background Image that dims when text appears */}
      <img 
        src={getImage()} 
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${hostSpeaking ? 'opacity-20 blur-sm' : 'opacity-60'}`} 
        alt="" 
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80 pointer-events-none" />

      {/* Navigation Arrows on edges */}
      <button onClick={onNavigatePrev} className="absolute left-0 top-0 bottom-0 w-16 md:w-20 z-50 flex items-center justify-center bg-black/10 hover:bg-black/40 transition-colors group">
         <div className="w-2 h-32 rounded-full bg-white/20 group-hover:bg-white/60 transition-colors flex items-center justify-center">
            <span className="sr-only">Previous Room</span>
         </div>
      </button>
      
      <button onClick={onNavigateNext} className="absolute right-0 top-0 bottom-0 w-16 md:w-20 z-50 flex items-center justify-center bg-black/10 hover:bg-black/40 transition-colors group">
         <div className="w-2 h-32 rounded-full bg-white/20 group-hover:bg-white/60 transition-colors flex items-center justify-center">
            <span className="sr-only">Next Room</span>
         </div>
      </button>

      {/* Top Left Room ID */}
      <div className="absolute top-8 left-16 md:left-24 z-40 w-14 h-14 bg-black/50 backdrop-blur-md rounded-2xl flex items-center justify-center font-bold text-2xl text-white border border-white/10 shadow-2xl">
         {roomId}
      </div>

      <div className="absolute inset-x-16 md:inset-x-24 top-0 bottom-0 flex flex-col z-30 pointer-events-none py-8">
         {/* Top Right Controls */}
         <div className="flex justify-end items-center gap-4 pointer-events-auto">
            {/* Lang List */}
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-2 py-1.5 rounded-full border border-white/5">
                <Languages size={20} className="text-slate-400 ml-2" />
                
                {activeLanguages.map(lang => (
                   <button
                     key={lang}
                     onClick={() => onLanguageSelect(lang)}
                     className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all ${targetLanguage === lang ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-transparent text-slate-300 hover:bg-white/10'}`}
                   >
                     {lang}
                   </button>
                ))}
                
                <div className="relative">
                   <button 
                     onClick={() => setShowLangPicker(!showLangPicker)}
                     className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                   >
                     <Plus size={16} className="text-white" />
                   </button>
                   
                   {showLangPicker && (
                      <div className="absolute top-10 right-0 w-48 max-h-64 overflow-y-auto bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/10 p-1 shadow-2xl">
                         {Object.entries(LANGUAGES).map(([code, name]) => (
                           <button 
                             key={code}
                             onClick={() => { onAddLanguage(code); setShowLangPicker(false); }}
                             className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 rounded-xl"
                           >
                              {name}
                           </button>
                         ))}
                      </div>
                   )}
                </div>
            </div>

            <button 
               onClick={() => setFace(f => f === 'STREAM' ? 'QR' : 'STREAM')}
               className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${face === 'QR' ? 'bg-blue-600 border border-blue-400' : 'bg-black/50 border border-white/10 hover:bg-white/10'}`}
            >
               <ScanQrCode size={20} className="text-white" />
            </button>
         </div>

         {/* Content Area - The Cube */}
         <div className="flex-1 relative mt-12 mb-8" style={{ perspective: '1000px' }}>
            <AnimatePresence mode="popLayout">
               <motion.div
                 key={face}
                 initial={{ rotateX: 90, opacity: 0, y: 50 }}
                 animate={{ rotateX: 0, opacity: 1, y: 0 }}
                 exit={{ rotateX: -90, opacity: 0, y: -50 }}
                 transition={{ type: "spring", stiffness: 300, damping: 30 }}
                 className="absolute inset-0 flex flex-col justify-end pointer-events-auto"
                 style={{ transformStyle: 'preserve-3d' }}
               >
                  {face === 'STREAM' && (
                     <div className="w-full h-full flex flex-col justify-end pb-12 opacity-80 mix-blend-screen text-shadow-xl" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}>
                        <p className="text-3xl md:text-5xl font-medium text-white/50 leading-relaxed max-w-4xl tracking-tight mb-6">
                           The translation stream will appear right here as the speaker continues.
                        </p>
                        <p className="text-4xl md:text-6xl font-semibold text-white leading-tight max-w-4xl tracking-tight">
                           Select a language above to see captions matching the spoken content.
                        </p>
                     </div>
                  )}

                  {face === 'QR' && (
                     <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-white/10 backdrop-blur-3xl p-10 rounded-[3rem] border border-white/20 shadow-2xl flex flex-col items-center">
                           <div className="bg-white p-6 rounded-[2rem] shadow-inner mb-6">
                              <QRCode value={`${window.location.protocol}//${window.location.host}/room/${roomId}`} size={200} />
                           </div>
                           <p className="text-white font-medium text-lg tracking-wide uppercase">Scan to join room {roomId}</p>
                        </div>
                     </div>
                  )}
               </motion.div>
            </AnimatePresence>
         </div>
      </div>
    </div>
  );
}
