import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ArrowRight, Languages } from 'lucide-react';
import { Room, ControlMessage } from '../types';

import churchImg from '../assets/images/church_meeting_1781028220295.png';
import classroomImg from '../assets/images/classroom_1781028236974.png';

export function LandingPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket;
    
    try {
       socket = new WebSocket(`${protocol}//${window.location.host}`);
       socket.onopen = () => {
         socket.send(JSON.stringify({ type: 'GET_ROOMS' }));
       };
   
       socket.onmessage = (event) => {
         if (typeof event.data === 'string') {
           const msg: ControlMessage = JSON.parse(event.data);
           if (msg.type === 'ROOMS_LIST') {
             // Ensure it is sorted by ID (1, 2, 3)
             const sorted = msg.rooms.sort((a,b) => a.id.localeCompare(b.id));
             setRooms(sorted);
           }
         }
       };
    } catch(e) {}

    return () => {
       if (socket) socket.close();
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 max-w-5xl mx-auto py-10">
      <div className="mb-12 text-center">
         <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg mb-6 shadow-blue-500/20">
            <Languages size={32} className="text-white" />
         </div>
         <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Live Translator</h1>
         <p className="text-slate-400">Select a room to join the interpretation stream.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        {rooms.map(room => (
          <div 
             key={room.id} 
             onClick={() => navigate(`/room/${room.id}`)} 
             className="bg-slate-800 rounded-[2rem] overflow-hidden cursor-pointer hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 relative group h-80 flex flex-col"
          >
            <div className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center font-bold text-white z-10 border border-white/10">
               {room.id}
            </div>
            
            <img 
               src={room.type === 'CHURCH' ? churchImg : classroomImg} 
               className="w-full h-48 object-cover opacity-60 group-hover:opacity-90 transition-opacity duration-300" 
               alt="" 
            />
            
            <div className="flex-1 p-6 flex flex-col justify-between bg-slate-800">
               <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-xl text-white mb-1">{room.name}</h2>
                    <div className="flex items-center gap-2">
                       {room.hostConnected ? (
                         <div className="flex items-center gap-2">
                           <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                           <span className="text-sm font-medium text-slate-300">{room.adminName}</span>
                         </div>
                       ) : (
                         <div className="flex items-center gap-2">
                           <div className="w-2.5 h-2.5 bg-slate-600 rounded-full" />
                           <span className="text-sm text-slate-500">No Host Connected</span>
                         </div>
                       )}
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-slate-700/50 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                     <ArrowRight size={20} className="text-slate-300 group-hover:text-white" />
                  </div>
               </div>
               
               {room.activeLanguages.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 text-slate-400">
                    <Languages size={16} />
                    <span className="text-xs font-medium tracking-wide">{room.activeLanguages.join(', ').toUpperCase()}</span>
                  </div>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
