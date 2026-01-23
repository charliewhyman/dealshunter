import { BrowserRouter as Router } from 'react-router-dom';
import { Footer } from './components/Footer';
import { ScrollToTop } from './components/ScrollToTop';
import { AppRoutes } from './AppRoutes';

function App() {
  return (
    <Router>
      <ScrollToTop />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <div className="flex-grow">
          <AppRoutes />
        </div>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
