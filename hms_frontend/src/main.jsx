import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import router from './Router/router.jsx'
import { RouterProvider } from 'react-router'
import './index.css'
import { AuthContexProvider } from './Provider/AuthContexProvider.jsx'
import { Toaster } from 'react-hot-toast' // ✅ use Toaster, not ToastBar


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthContexProvider>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"   // 🔹 choose where to show the toasts
        reverseOrder={false}   // 🔹 newest toast on top (optional)
        toastOptions={{
          duration: 3000,
          style: {
            background: '#333',
            color: '#fff',
          },
        }}
      />
    </AuthContexProvider>
  </StrictMode>
)
