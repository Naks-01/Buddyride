import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './styles/global.css';

const savedTheme = localStorage.getItem('theme');
document.documentElement.classList.toggle('dark', savedTheme === 'dark');

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);