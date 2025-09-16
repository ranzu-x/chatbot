import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import router from './Router/router.jsx'
import { RouterProvider } from 'react-router'
import './index.css'
import { AuthContexProvider } from './Provider/AuthContexProvider.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthContexProvider>
      <RouterProvider router={router} />
    </AuthContexProvider>
  </StrictMode>
)
