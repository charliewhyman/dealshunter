import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Header } from './components/Header';

function App() {

  return (
      <Router>
         <div className="min-h-screen bg-gray-50">
         <Header/>
            <Routes>
              <Route path="/" element={<HomePage />} />
            </Routes>
          </div>
      </Router>
  );
}

export default App
