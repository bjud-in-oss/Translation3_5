import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, User, ArrowRight, Languages } from 'lucide-react';
import { Room, ControlMessage } from '../types';

import churchImg from '../assets/images/church_meeting_1781028220295.png';
import classroomImg from '../assets/images/classroom_1781028236974.png';

export function LandingPage() {
  const [name, setName] = useState(localStorage.getItem('savedName') || '');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    setWs(socket);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'GET_ROOMS' }));
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg: ControlMessage = JSON.parse(event.data);
        if (msg.type === 'ROOMS_LIST') {
          setRooms(msg.rooms);
        }
      }
    };

    return () => socket.close();
  }, []);

  const handleCreateRoom = (type: 'CHURCH' | 'CLASSROOM') => {
    if (!name) return alert('👤 + 📝'); // Name required
    localStorage.setItem('savedName', name);
    navigate(`/room/new?type=${type}&adminName=${encodeURIComponent(name)}`);
  };

  const handleJoinRoom = (roomId: string) => {
    if (!name) return alert('👤 + 📝');
    localStorage.setItem('savedName', name);
    navigate(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-4 max-w-2xl mx-auto pt-10">
      <div className="mb-8 p-4 bg-slate-800 rounded-full border border-slate-700 w-full flex items-center gap-4 shadow-lg">
         <User size={24} className="text-slate-400" />
         <input 
            type="text" 
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="..."
            className="bg-transparent flex-1 outline-none text-xl font-medium"
         />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
        {rooms.map(room => (
          <div key={room.id} onClick={() => handleJoinRoom(room.id)} className="bg-slate-800 rounded-2xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition shadow-xl relative group">
            <img src={room.type === 'CHURCH' ? churchImg : classroomImg} className="w-full h-40 object-cover opacity-80 group-hover:opacity-100 transition" alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent flex flex-col justify-end p-4">
               <div className="flex justify-between items-end">
                  <div>
                    <div className="flex items-center gap-2">
                       {room.hostConnected ? <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" /> : <div className="w-3 h-3 bg-red-500 rounded-full" />}
                       <span className="font-medium text-lg drop-shadow-md">{room.adminName}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-slate-300 drop-shadow-md">
                      <Languages size={14} />
                      <span className="text-sm">{room.activeLanguages.join(', ')}</span>
                    </div>
                  </div>
                  <ArrowRight size={24} className="text-blue-400" />
               </div>
            </div>
          </div>
        ))}

        <div onClick={() => handleCreateRoom('CHURCH')} className="bg-slate-800 rounded-2xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition shadow-xl relative group flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-600 hover:border-blue-500 hover:bg-slate-800/80">
            <Plus size={48} className="text-slate-500 group-hover:text-blue-400 transition" />
            <img src={churchImg} className="w-12 h-12 mt-2 rounded-full opacity-50" alt="" />
        </div>

        <div onClick={() => handleCreateRoom('CLASSROOM')} className="bg-slate-800 rounded-2xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition shadow-xl relative group flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-600 hover:border-blue-500 hover:bg-slate-800/80">
            <Plus size={48} className="text-slate-500 group-hover:text-blue-400 transition" />
            <img src={classroomImg} className="w-12 h-12 mt-2 rounded-full opacity-50" alt="" />
        </div>
      </div>
    </div>
  );
}
