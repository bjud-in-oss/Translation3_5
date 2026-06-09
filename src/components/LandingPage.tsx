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
  { id: '3', name: '', type: 'CONFERENCE', adminId: null, adminName: null, hostConnected: false, mode: 'ONE_WAY', aecEnabled: true, activeLanguages: [] }
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
             setRooms(sorted.length > 0 ? sorted : DEFAULT_ROOMS);
           }
         }
       };
       socket.onerror = () => {
         setRooms(DEFAULT_ROOMS);
       };
    } catch(e) {}

    return () => {
       if (socket) socket.close();
    }
  }, []);

  const getImageForRoom = (id: string) => {
    if (id === '1') return churchImg;
    if (id === '2') return classroomImg;
    if (id === '3') return conferenceImg;
    return classroomImg;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 max-w-5xl mx-auto py-10">
      <div className="mb-12 text-center">
         <div className="mx-auto w-24 h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <Languages size={48} className="text-white" />
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        {rooms.map(room => (
          <div 
             key={room.id} 
             onClick={() => navigate(`/room/${room.id}`)} 
             className="bg-slate-800 rounded-[2rem] overflow-hidden cursor-pointer hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-500/30 transition-all duration-300 relative group h-80 flex flex-col"
          >
            <div className="absolute top-6 left-6 w-14 h-14 bg-black/50 backdrop-blur-md rounded-2xl flex items-center justify-center font-bold text-2xl text-white z-10 border border-white/10">
               {room.id}
            </div>
            
            <img 
               src={getImageForRoom(room.id)} 
               className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-300 absolute inset-0" 
               alt="" 
            />
          </div>
        ))}
      </div>
    </div>
  );
}
