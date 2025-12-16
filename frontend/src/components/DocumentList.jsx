import React, { useState, useEffect, useCallback } from 'react';
import { getDocuments } from '../api';
import Pagination from './Pagination';

function DocumentList() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const ITEMS_PER_PAGE = 10;

  const fetchDocuments = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDocuments(page, ITEMS_PER_PAGE);
      setDocuments(data.items || []);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="loading">Loading documents...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="document-list">
      <h2>Coda Documents</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Published</th>
            <th>Folder</th>
          </tr>
        </thead>
        <tbody>
          {documents.map(doc => (
            <tr key={doc.id}>
              <td>
                <a href={doc.browserLink} target="_blank" rel="noopener noreferrer">
                  {doc.name}
                </a>
              </td>
              <td>{formatDate(doc.createdAt)}</td>
              <td>{formatDate(doc.updatedAt)}</td>
              <td>
                <span className={`badge ${doc.published ? 'badge-warning' : 'badge-success'}`}>
                  {doc.published ? 'Yes' : 'No'}
                </span>
              </td>
              <td>{doc.folder?.name || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {documents.length === 0 && (
        <div className="empty-state">No documents found</div>
      )}

      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={(page) => fetchDocuments(page)}
        />
      )}
    </div>
  );
}

export default DocumentList;
