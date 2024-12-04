import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Header } from './components/Header';
import { AuthProvider } from './contexts/AuthContext';
import { useState } from 'react';

function App() {

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <AuthProvider>
      <Router>
         <div className="min-h-screen bg-gray-50">
         <Header onAuthClick={() => setIsAuthModalOpen(true)} />
            <Routes>
              <Route path="/" element={<HomePage />} />
            </Routes>
            {/* TODO: Add AuthModal component */}
            <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
          />
          </div>
      </Router>
    </AuthProvider>
  );
}

export default App
