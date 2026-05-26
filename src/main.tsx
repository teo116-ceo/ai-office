import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initAppStorage } from './utils/initAppStorage'

initAppStorage()
createRoot(document.getElementById('root')!).render(<App />)
