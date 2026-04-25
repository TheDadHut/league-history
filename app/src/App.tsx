import { Route, Routes } from 'react-router-dom'
import './App.css'

function Home() {
  return (
    <main>
      <h1>GDL History</h1>
      <p>React app scaffold. Tabs migrated incrementally per the migration plan.</p>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}

export default App
