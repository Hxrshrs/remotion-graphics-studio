import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Warm the emoji face before a scene paints. An @font-face is only fetched
// when a glyph asks for it, so without this the first preview of a shot with
// emoji shows the host's artwork for as long as the file takes to arrive.
// A Mac resolves it to the system copy and downloads nothing.
document.fonts?.load("400 100px 'Apple Color Emoji'", '😀').catch(() => undefined);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
);
