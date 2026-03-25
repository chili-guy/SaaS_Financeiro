import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';
import ThanksPage from './ThanksPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/obrigado" element={<ThanksPage />} />
        {/* Adicionei uma rota de fallback para evitar 404 caso o usuário erre a URL */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </Router>
  );
}

export default App;
