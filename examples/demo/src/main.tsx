import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { loadFonts } from './themes/fonts';

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');

// Canvas text is measured with whatever face is loaded: wait (briefly) for the
// bundled fonts before the first frame.
void loadFonts().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
