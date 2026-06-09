import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { Room, ControlMessage } from '../types';

import churchImg from '../assets/images/church_meeting_1781028220295.png';
import classroomImg from '../assets/images/classroom_1781028236974.png';
import conferenceImg from '../assets/images/conference_room_1781033040204.png';

const DEFAULT_ROOMS: Room[] = [
  { id: '1', name: '', type: 'CHURCH', adminId: null, adminName: null, hostConnected: false, mode: 'ONE_WAY', aecEnabled: true, activeLanguages: [] },
  { id: '2', name: '', type: 'CLASSROOM', adminId: null, adminName: null, hostConnected: false, mode: 'ONE_WAY', aecEnabled: true, activeLanguages: [] },
  { id: '3', name: '', type: 'CLASSROOM', adminId: null, adminName: null, hostConnected: false, mode: 'ONE_WAY', aecEnabled: true, activeLanguages: [] }
];

export function LandingPage() {
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS);
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

  const getImageForRoom = (id: string, type: string) => {
    if (id === '1') return churchImg;
    if (id === '2') return classroomImg;
    if (id === '3') return conferenceImg;
    return classroomImg; // Fallback
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 max-w-5xl mx-auto py-10">
      <div className="mb-12 text-center">
         <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Languages size={32} className="text-white" />
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        {rooms.map(room => (
          <div 
             key={room.id} 
             onClick={() => navigate(`/room/${room.id}`)} 
             className="bg-slate-800 rounded-[2rem] overflow-hidden cursor-pointer hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 relative group h-64 flex flex-col"
          >
            <div className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center font-bold text-white z-10 border border-white/10">
               {room.id}
            </div>
            
            <img 
               src={getImageForRoom(room.id, room.type)} 
               className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity duration-300 absolute inset-0" 
               alt="" 
            />
            
            <div className="absolute inset-x-0 bottom-0 p-4 flex justify-between items-end bg-gradient-to-t from-slate-900 to-transparent">
               <div className="flex items-center gap-2">
                  {room.hostConnected ? (
                    <div className="w-4 h-4 shadow-[0_0_8px_rgba(34,197,94,0.6)] bg-green-500 rounded-full animate-pulse" />
                  ) : (
                    <div className="w-4 h-4 bg-slate-600 rounded-full" />
                  )}
               </div>
               
               {room.activeLanguages.length > 0 && (
                  <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-slate-200">
                    <Languages size={16} />
                  </div>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
