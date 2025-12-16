require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const logger = require('./config/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../public')));


// ============================================
// CONFIGURATION
// ============================================

const USE_DUMMY_DATA = process.env.USE_DUMMY_DATA === 'true' || !process.env.CODA_API_TOKEN;
const CODA_API_TOKEN = process.env.CODA_API_TOKEN;
const CODA_BASE_URL = 'https://coda.io/apis/v1';



const codaClient = axios.create({
  baseURL: CODA_BASE_URL,
  headers: {
    'Authorization': `Bearer ${CODA_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Coda API functions
async function fetchDocumentsFromCoda() {
  try {
    const response = await codaClient.get('/docs', { params: { limit: 50 } });
    logger.info(`Fetched ${response.data.items.length} documents from Coda`);
    return response.data.items;
  } catch (error) {
    const status = error.response?.status;
    const errorMsg = error.response?.data?.message || error.message;
    logger.error(`Error fetching documents from Coda: ${status} - ${errorMsg}`);
    throw error;
  }
}

async function fetchTablesFromCoda(docId) {
  try {
    const response = await codaClient.get(`/docs/${docId}/tables`);
    return response.data.items || [];
  } catch (error) {
    logger.error(`Error fetching tables for doc ${docId}:`, error.message);
    return [];
  }
}

async function fetchRowsFromCoda(docId, tableId) {
  try {
    const response = await codaClient.get(`/docs/${docId}/tables/${tableId}/rows`, {
      params: { limit: 100 }
    });
    return response.data.items || [];
  } catch (error) {
    logger.error(`Error fetching rows for table ${tableId}:`, error.message);
    return [];
  }
}

async function deleteRowFromCoda(docId, tableId, rowId) {
  try {
    await codaClient.delete(`/docs/${docId}/tables/${tableId}/rows/${rowId}`);
    logger.info(`Deleted row ${rowId} from Coda`);
    return true;
  } catch (error) {
    logger.error(`Error deleting row ${rowId}:`, error.message);
    throw error;
  }
}

let documents = [];
let alerts = [];
let alertIdCounter = 1;

const ALERT_TYPES = {
  UNUSED_DOCUMENT: 'unused_document',
  PUBLIC_DOCUMENT: 'public_document',
  SENSITIVE_DATA_TABLE: 'sensitive_data_table'
};

const ALERT_STATUS = {
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  REMEDIATED: 'remediated',
  IGNORED: 'ignored'
};

// Sensitive data patterns
const SENSITIVE_PATTERNS = {
  creditCard: { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, name: 'Credit Card Number', severity: 'high' },
  // ssn: { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, name: 'Social Security Number', severity: 'high' },
  email: { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, name: 'Email Address', severity: 'medium' },
  phone: { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, name: 'Phone Number', severity: 'medium' },
  password: { pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, name: 'Password', severity: 'critical' },
  apiKey: { pattern: /\b(?:api[_-]?key|apikey|api[_-]?token|access[_-]?token|secret[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{10,}['"]?/gi, name: 'API Key/Token', severity: 'critical' },
  awsKey: { pattern: /\bAKIA[0-9A-Z]{16}\b/g, name: 'AWS Access Key', severity: 'critical' },
  privateKey: { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, name: 'Private Key', severity: 'critical' }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function createAlert(alertData) {
  const existing = alerts.find(a =>
    a.type === alertData.type &&
    a.docId === alertData.docId &&
    a.resourceId === alertData.resourceId &&
    a.status === ALERT_STATUS.OPEN
  );

  if (existing) return existing;

  const alert = {
    id: alertIdCounter++,
    ...alertData,
    status: ALERT_STATUS.OPEN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  alerts.push(alert);
  logger.info(`Alert created: ${alert.title}`);
  return alert;
}

function scanText(text) {
  const findings = [];
  if (!text || typeof text !== 'string') return findings;

  for (const [type, config] of Object.entries(SENSITIVE_PATTERNS)) {
    const matches = text.match(config.pattern);
    if (matches) {
      findings.push({
        type,
        name: config.name,
        severity: config.severity,
        count: matches.length,
        samples: matches.slice(0, 2).map(m => m.slice(0, 4) + '****' + m.slice(-2))
      });
    }
  }
  return findings;
}

// ============================================
// SECURITY SCANNER
// ============================================

async function runSecurityScan() {
  logger.info(`Starting security scan (mode: ${USE_DUMMY_DATA ? 'DEMO' : 'LIVE'})...`);
  const scanResults = { documentsScanned: 0, alertsCreated: 0, errors: [] };
  const TEN_MINUTES_MS = 10 * 60 * 1000; 
  const now = new Date();

  try {

    documents = await fetchDocumentsFromCoda();

    for (const doc of documents) {
    scanResults.documentsScanned++;

    const updatedAt = new Date(doc.updatedAt).getTime();
    const  daysSinceUpdate= now - updatedAt
      if (daysSinceUpdate >= TEN_MINUTES_MS) {
        createAlert({
          type: ALERT_TYPES.UNUSED_DOCUMENT,
          severity: 'low',
          title: `Unused Document: ${doc.name}`,
          description: `Document has not been modified in ${daysSinceUpdate} days`,
          docId: doc.id,
          docName: doc.name,
          resourceId: doc.id,
          resourceType: 'document',
          metadata: { lastUpdated: doc.updatedAt, daysSinceUpdate }
        });
        scanResults.alertsCreated++;
      }

      // Check for public documents
      if (doc.published) {
        createAlert({
          type: ALERT_TYPES.PUBLIC_DOCUMENT,
          severity: 'high',
          title: `Publicly Published: ${doc.name}`,
          description: 'Document is publicly accessible - potential data exposure risk',
          docId: doc.id,
          docName: doc.name,
          resourceId: doc.id,
          resourceType: 'document',
          metadata: { publishedUrl: doc.browserLink }
        });
        scanResults.alertsCreated++;
      }

      // Scan tables
      try {
        let tables;
        tables = await fetchTablesFromCoda(doc.id);

        for (const table of tables) {
          let rows;
          if (USE_DUMMY_DATA) {
            rows = table.rows || [];
          } else {
            rows = await fetchRowsFromCoda(doc.id, table.id);
          }

          for (const row of rows) {
            const values = row.values || {};
            for (const [colName, value] of Object.entries(values)) {
              const findings = scanText(String(value));
              for (const finding of findings) {
                createAlert({
                  type: ALERT_TYPES.SENSITIVE_DATA_TABLE,
                  severity: finding.severity,
                  title: `${finding.name} found in: ${table.name}`,
                  description: `Detected ${finding.count} instance(s) in column "${colName}"`,
                  docId: doc.id,
                  docName: doc.name,
                  resourceId: row.id,
                  resourceType: 'row',
                  metadata: { tableId: table.id, tableName: table.name, columnName: colName, sensitiveType: finding.type }
                });
                scanResults.alertsCreated++;
              }
            }
          }
        }
      } catch (error) {
        scanResults.errors.push({ docId: doc.id, error: error.message });
      }
    }

    logger.info(`Scan complete: ${scanResults.documentsScanned} docs, ${scanResults.alertsCreated} new alerts`);
    return scanResults;
  } catch (error) {
    logger.error('Scan failed:', error.message);
    throw error;
  }
}

// ============================================
// API ROUTES
// ============================================

// GET /api/data - Returns all data in one response
app.get('/api/data', (req, res) => {
  try {
    const sortedAlerts = [...alerts].sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const stats = { total: alerts.length, byStatus: {}, byType: {}, bySeverity: {} };
    for (const alert of alerts) {
      stats.byStatus[alert.status] = (stats.byStatus[alert.status] || 0) + 1;
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
    }

    res.json({
      documents,
      alerts: sortedAlerts,
      stats,
      lastScan: new Date().toISOString(),
      mode: USE_DUMMY_DATA ? 'demo' : 'live'
    });
  } catch (error) {
    logger.error('Error fetching data:', error.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Documents endpoints
app.get('/api/documents', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    let docs;

    if (USE_DUMMY_DATA) {
      docs = documents;
    } else {
      docs = await fetchDocumentsFromCoda();
    }

    const total = docs.length;
    const start = (parseInt(page) - 1) * parseInt(limit);
    const items = docs.slice(start, start + parseInt(limit));

    res.json({
      items,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Error fetching documents:', error.message);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.get('/api/documents/:docId', (req, res) => {
  const doc = documents.find(d => d.id === req.params.docId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(doc);
});

// Alerts endpoints
app.get('/api/alerts', (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const sorted = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const total = sorted.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  const items = sorted.slice(start, start + parseInt(limit));

  res.json({
    items,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
  });
});

app.get('/api/alerts/stats', (req, res) => {
  const stats = { total: alerts.length, byStatus: {}, byType: {}, bySeverity: {} };
  for (const alert of alerts) {
    stats.byStatus[alert.status] = (stats.byStatus[alert.status] || 0) + 1;
    stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
    stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
  }
  res.json(stats);
});

app.get('/api/alerts/:id', (req, res) => {
  const alert = alerts.find(a => a.id === parseInt(req.params.id));
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

app.patch('/api/alerts/:id/status', (req, res) => {
  const alert = alerts.find(a => a.id === parseInt(req.params.id));
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const { status } = req.body;
  if (!Object.values(ALERT_STATUS).includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  alert.status = status;
  alert.updatedAt = new Date().toISOString();
  logger.info(`Alert ${alert.id} status updated to ${status}`);
  res.json(alert);
});

// Remediation endpoint
app.post('/api/alerts/:id/remediate', async (req, res) => {
  const alert = alerts.find(a => a.id === parseInt(req.params.id));
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const { action } = req.body;
  let result = { success: false, message: '' };

  switch (action) {
    case 'delete':
      if (alert.resourceType === 'row') {
        try {
          await deleteRowFromCoda(alert.docId, alert.metadata.tableId, alert.resourceId);
          alert.status = ALERT_STATUS.REMEDIATED;
          alert.updatedAt = new Date().toISOString();
          result = { success: true, message: 'Row deleted successfully' };
        } catch (error) {
          result = { success: false, message: `Failed to delete: ${error.message}` };
        }
      } else {
        result = { success: false, message: 'Delete action only supported for table rows' };
      }
      break;

    case 'acknowledge':
      alert.status = ALERT_STATUS.ACKNOWLEDGED;
      alert.updatedAt = new Date().toISOString();
      result = { success: true, message: 'Alert acknowledged' };
      break;

    case 'ignore':
      alert.status = ALERT_STATUS.IGNORED;
      alert.updatedAt = new Date().toISOString();
      result = { success: true, message: 'Alert ignored' };
      break;

    default:
      result = { success: false, message: 'Invalid action. Use: delete, acknowledge, or ignore' };
  }

  logger.info(`Remediation "${action}" on alert ${alert.id}: ${result.message}`);
  res.json(result);
});

// Manual scan trigger
app.post('/api/scan', async (req, res) => {
  try {
    logger.info('Manual scan triggered');
    const results = await runSecurityScan();
    res.json({ success: true, results });
  } catch (error) {
    logger.error('Scan failed:', error.message);
    res.status(500).json({ error: 'Scan failed', message: error.message });
  }
});


// SPA catch-all 
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// SCHEDULED SCANNING
// ============================================

const scanIntervalMinutes = parseInt(process.env.SCAN_INTERVAL_MINUTES) || 5;

// Start server after initial scan completes
(async () => {
  // Run initial scan on startup and wait for it to complete
  logger.info('Running initial security scan...');
  await runSecurityScan();
  logger.info('Initial scan complete.');

  // Schedule periodic scans
  cron.schedule(`*/${scanIntervalMinutes} * * * *`, async () => {
    logger.info(`Scheduled scan running (every ${scanIntervalMinutes} minutes)`);
    await runSecurityScan();
  });

  // Start server
  app.listen(PORT, () => {
    logger.info(`=================================`);
    logger.info(`SecureCoda Backend Server`);
    logger.info(`=================================`);
    logger.info(`Port: ${PORT}`);
    logger.info(`Mode: ${USE_DUMMY_DATA ? 'DEMO (dummy data)' : 'LIVE (Coda API)'}`);
    logger.info(`Scan interval: ${scanIntervalMinutes} minutes`);
    logger.info(`=================================`);
  });
})();
