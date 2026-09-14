import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
// Nap SAU index.css: file nay sinh tu brand/brand.json va de len cac bien mau.
import '@/brand.generated.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
