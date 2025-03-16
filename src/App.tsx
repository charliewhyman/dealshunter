import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import ProductPage from './pages/ProductPage';

function App() {
  return (
    <Router>
      {/* Main app container */}
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/Products/:ProductId" element={<ProductPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;