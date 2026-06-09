import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { ActiveRoom } from './components/ActiveRoom';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/room/:roomId" element={<ActiveRoom />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
