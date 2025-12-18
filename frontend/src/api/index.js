import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Documents API
export const getDocuments = async (page = 1, limit = 10) => {
  const params = { page, limit };
  const response = await api.get('/documents', { params });
  return response.data;
};

// Alerts API
export const getAlerts = async (page = 1, limit = 10) => {
  const params = { page, limit };
  const response = await api.get('/alerts', { params });
  return response.data;
};

export const getAlertStats = async () => {
  const response = await api.get('/alerts/stats');
  return response.data;
};

export const remediateAlert = async (alertId, action) => {
  const response = await api.post(`/alerts/${alertId}/remediate`, { action });
  return response.data;
};


// Scan API
export const triggerScan = async () => {
  const response = await api.post('/scan');
  return response.data;
};

export default api;
