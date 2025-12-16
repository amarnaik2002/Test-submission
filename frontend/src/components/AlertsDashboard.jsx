import React, { useState, useEffect, useCallback } from 'react';
import { getAlerts, getAlertStats, remediateAlert, triggerScan } from '../api';

function AlertsDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const AUTO_REFRESH_INTERVAL = 30000;

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAlerts(1, 1000);
      setAlerts(data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = async () => {
    try {
      const data = await getAlertStats();
      setStats(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch stats');
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchStats();

    // Auto-refresh
    const interval = setInterval(() => {
      fetchAlerts();
      fetchStats();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerScan();
      await fetchAlerts();
      await fetchStats();
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleRemediate = async (alertId, action) => {
    try {
      await remediateAlert(alertId, action);
      await fetchAlerts();
      await fetchStats();
    } catch (err) {
      setError(err.message || 'Remediation failed');
    }
  };

  const getSeverityClass = (severity) => {
    const classes = {
      critical: 'severity-critical',
      high: 'severity-high',
      medium: 'severity-medium',
      low: 'severity-low'
    };
    return classes[severity] || '';
  };

  const getStatusClass = (status) => {
    const classes = {
      open: 'status-open',
      acknowledged: 'status-acknowledged',
      remediated: 'status-remediated',
      ignored: 'status-ignored'
    };
    return classes[status] || '';
  };

  return (
    <div className="alerts-dashboard">
      <div className="dashboard-header">
        <h2>Security Alerts Dashboard</h2>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn btn-primary"
        >
          {scanning ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="stats-container">
          <div className="stat-card">
            <h3>Total Alerts</h3>
            <p className="stat-value">{stats.total}</p>
          </div>
          <div className="stat-card">
            <h3>Critical</h3>
            <p className="stat-value severity-critical">{stats.bySeverity?.critical || 0}</p>
          </div>
          <div className="stat-card">
            <h3>High</h3>
            <p className="stat-value severity-high">{stats.bySeverity?.high || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Open</h3>
            <p className="stat-value status-open">{stats.byStatus?.open || 0}</p>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading">Loading alerts...</div>
      ) : (
        <>
          <table className="alerts-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Title</th>
                <th>Document</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => (
                <tr key={alert.id}>
                  <td>
                    <span className={`badge ${getSeverityClass(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </td>
                  <td>
                    <div className="alert-title">{alert.title}</div>
                    <div className="alert-description">{alert.description}</div>
                  </td>
                  <td>{alert.docName}</td>
                  <td>{alert.type.replace(/_/g, ' ')}</td>
                  <td>
                    <span className={`badge ${getStatusClass(alert.status)}`}>
                      {alert.status}
                    </span>
                  </td>
                  <td>{new Date(alert.createdAt).toLocaleString()}</td>
                  <td>
                    {alert.status === 'open' && (
                      <div className="action-buttons">
                        {alert.resourceType === 'row' && (
                          <button
                            onClick={() => handleRemediate(alert.id, 'delete')}
                            className="btn btn-danger btn-sm"
                          >
                            Delete Row
                          </button>
                        )}
                        <button
                          onClick={() => handleRemediate(alert.id, 'acknowledge')}
                          className="btn btn-secondary btn-sm"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => handleRemediate(alert.id, 'ignore')}
                          className="btn btn-outline btn-sm"
                        >
                          Ignore
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {alerts.length === 0 && (
            <div className="empty-state">
              No alerts found. Run a scan to detect security issues.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AlertsDashboard;
