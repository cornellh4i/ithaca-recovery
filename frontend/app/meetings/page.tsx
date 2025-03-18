'use client';

import React, { useState } from "react";

const MeetingsPage = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCompare = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log("Client: Starting API call");
      const response = await fetch('/api/sync/calendar-sync');
      console.log("Client: Received response with status:", response.status);
      
      const data = await response.json();
      console.log("Client: Parsed response data:", data);
      setResult(data);
    } catch (err) {
      console.error("Error in meetings comparison:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Meetings Comparison</h1>
      
      <button 
        onClick={handleCompare}
        disabled={loading}
        style={{
          padding: '10px 20px',
          margin: '20px 0',
          backgroundColor: loading ? '#ccc' : '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Comparing...' : 'Compare Meetings'}
      </button>

      {error && (
        <div>
          <h2>Error</h2>
          <p style={{ color: 'red' }}>{error}</p>
        </div>
      )}
      
      {result && (
        <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc' }}>
          <h3>Comparison Result</h3>
          
          {result.error ? (
            <div>
              <p style={{ color: 'red' }}>Error: {result.error}</p>
              {result.details && (
                <p style={{ color: 'red' }}>
                  Details: {result.details}
                </p>
              )}
              {result.stack && (
                <pre style={{ background: '#fff0f0', padding: '10px', overflow: 'auto' }}>
                  {result.stack}
                </pre>
              )}
            </div>
          ) : (
            <div>
              <p>Comparison completed successfully.</p>
              <pre style={{ background: '#f0f0f0', padding: '10px', overflow: 'auto', maxHeight: '400px' }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
      
      <p style={{ marginTop: '20px' }}>
        <a href="/" style={{ color: 'blue', textDecoration: 'underline' }}>Return to Home</a>
      </p>
    </div>
  );
};

export default MeetingsPage;