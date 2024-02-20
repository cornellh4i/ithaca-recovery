"use client"

import React from 'react';

function App() {
  const handleButtonClick = async () => {
    try {
      const response = await fetch('/api/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          { "uid": "4iN010DwUFVMMMO6BxIuC6XVMG93", "name": "Joseph Ugarte"}
        ),
      });

      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClick2 = async () => {
    try {

      const response = await fetch('/api/retrieve');
      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClick3 = async () => {
    try {
      const response = await fetch("/api/delete", {
        method: "POST",
      });
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  const handleButtonClick4 = async () => {
    try {
      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'Hello World!' }),
      });
  
      if (response.ok) {
        console.log('Success');
      } else {
        console.error('Error:', response.statusText);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <button className="btn" onClick={handleButtonClick}>Call create users post /api/write</button>
      <button className="btn" onClick={handleButtonClick2}>Call get all data /api/retrieve</button>
      <button className="btn" onClick={handleButtonClick3}>Call delete post /api/delete</button>
      <button className="btn btn-active btn-secondary" onClick={handleButtonClick4}>Call webhook post /api/webhook</button>
    </div>
  );
}

export default App;