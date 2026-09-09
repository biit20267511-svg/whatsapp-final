import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { Toaster } from './components/ui/sonner'
import { queryClient } from './lib/queryClient'
import { ThemeProvider } from './context/ThemeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><BrowserRouter><App /><Toaster position="top-right" richColors /></BrowserRouter></ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
