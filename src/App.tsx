import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Header } from './components/Header';
import { AuthProvider } from './contexts/AuthContext';
import { useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { SubmitProductPage } from './pages/SubmitProductPage';
import { UserPage } from './pages/UserPage'
import ProductPage from './pages/ProductPage';

function App() {

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <AuthProvider>
      <Router>
         <div className="min-h-screen bg-gray-50">
         <Header onAuthClick={() => setIsAuthModalOpen(true)} />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/submit" element={<SubmitProductPage />} />
              <Route path="/user" element={<UserPage />} />
              <Route path="/Products/:ProductId" element={<ProductPage />} />
            </Routes>
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
