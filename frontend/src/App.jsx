import React, {useEffect, useState} from 'react'

export default function App(){
  const [status, setStatus] = useState('loading')
  const [dbVersion, setDbVersion] = useState('')

  useEffect(()=>{
    fetch('http://localhost:8000/health').then(r=>r.json()).then(d=>setStatus(d.status)).catch(()=>setStatus('error'))
    fetch('http://localhost:8000/db_version').then(r=>r.json()).then(d=>setDbVersion(d.version || JSON.stringify(d))).catch(()=>setDbVersion('error'))
  },[])

  const statusBg = status === 'ok' ? '#10b981' : status === 'loading' ? '#f59e0b' : '#ef4444'
  const statusText = status === 'ok' ? 'Active' : status === 'loading' ? 'Connecting...' : 'Offline'

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="navbar">
        <div className="container">
          <div className="logo">🌍 KeptCarbon</div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#status">Status</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Carbon Offset Platform</h1>
          <p>Track, manage, and optimize your environmental impact with real-time geospatial data.</p>
          <button className="cta-btn">Get Started</button>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <h2>Features</h2>
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Real-time Analytics</h3>
              <p>Monitor carbon metrics with live dashboards</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🗺️</div>
              <h3>Geospatial Data</h3>
              <p>PostGIS-powered location-based insights</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Fast API</h3>
              <p>Lightning-quick backend with FastAPI</p>
            </div>
          </div>
        </div>
      </section>

      {/* System Status */}
      <section id="status" className="status-section">
        <div className="container">
          <h2>System Status</h2>
          <div className="status-grid">
            <div className="status-card">
              <div className="status-header">
                <h3>Backend</h3>
                <span className="status-badge" style={{backgroundColor: statusBg}}>{statusText}</span>
              </div>
              <p className="status-detail">FastAPI Server</p>
            </div>
            <div className="status-card">
              <div className="status-header">
                <h3>Database</h3>
                <span className="status-badge" style={{backgroundColor: dbVersion ? '#10b981' : '#f59e0b'}}>Connected</span>
              </div>
              <p className="status-detail">{dbVersion ? dbVersion.substring(0, 50) + '...' : 'Initializing...'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 KeptCarbon. Building a sustainable future.</p>
          <div className="footer-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
