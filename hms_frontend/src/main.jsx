import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import router from './Router/router.jsx'
import { RouterProvider } from 'react-router'
import './index.css'


createRoot(document.getElementById('root')).render(
  <StrictMode>
     <RouterProvider router={router} />
  </StrictMode>
)
