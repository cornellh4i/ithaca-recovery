"use client";

import React from 'react';
//import { render, screen } from '@testing-library/react';
import { test } from '@jest/globals';

const AdminTest: React.FC = () => {
  // function AdminTests() {
  const handleButtonClick = async () => {
    try {
      const response = await fetch('/api/write/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          { "uid": "4iN010DwUFVMMMO6BxIuC6XVMG93", "name": "Joseph Ugarte", "email": "ju24@gmail.com", "privilegeMode": "Admin" }
        ),
      });

      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClick2 = async () => {
    try {

      const response = await fetch('/api/retrieve/admin');
      console.log(await response.text());
    } catch (error) {
      console.error('There was an error fetching the data:', error);
    }
  };

  const handleButtonClick3 = async () => {
    try {
      const response = await fetch("/api/delete/admin", {
        method: "DELETE",
      });
      const data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  /*test('checks create', () => {
    render(<button className="btn" onClick={handleButtonClick} > Call create users post / api / write / admin</button>);
  });*/


  return (
    <div>
      <button className="btn" onClick={handleButtonClick} > Call create users post / api / write / admin</button>
      <button className="btn" onClick={handleButtonClick2} > Call get all data / api / retrieve / admin </button>
      <button className="btn" onClick={handleButtonClick3} > Call delete post / api / delete / admin </button>
    </div>
  );
}

export default AdminTest;