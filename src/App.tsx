import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Header } from './components/Header';
import ProductPage from './pages/ProductPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Header/>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/Products/:ProductId" element={<ProductPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
