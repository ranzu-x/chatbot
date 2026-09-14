import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyAppearance } from './theme/appearance'

// Apply the saved font / accent / density before the first paint so the app
// never flashes the default typeface.
applyAppearance()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
