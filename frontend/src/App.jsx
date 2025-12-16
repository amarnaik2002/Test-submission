import React, { useState } from 'react';
import DocumentList from './components/DocumentList';
import AlertsDashboard from './components/AlertsDashboard';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('alerts');

  return (
    <div className="app">
      <header className="app-header">
        <h1>SecureCoda</h1>
        <p>Activity & Exposure Monitor</p>
      </header>

      <nav className="app-nav">
        <button
          className={`nav-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          Alerts Dashboard
        </button>
        <button
          className={`nav-btn ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'alerts' && <AlertsDashboard />}
        {activeTab === 'documents' && <DocumentList />}
      </main>

      <footer className="app-footer">
        <p>SecureCoda - Coda Security Monitoring System</p>
      </footer>
    </div>
  );
}

export default App;
