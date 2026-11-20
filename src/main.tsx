import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Automatically normalize 127.0.0.1 to localhost for local testing so Firebase Auth authorized domains succeed
if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
  window.location.replace(window.location.href.replace('127.0.0.1', 'localhost'));
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}
