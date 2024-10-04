"use client";

import React, { useState } from 'react';
import TextField from '../components/atoms/TextField/index'; // Import the TextField component

const ExampleForm = () => {
  const [inputValue, setInputValue] = useState(''); // State to hold the value

  return (
    <div>
      <h2>Example Form</h2>
      <TextField
        label="Name"
        value={inputValue}
        onChange={setInputValue}
        underlineOnFocus={false} // Optional prop, defaults to true
      />
      <TextField
        value={inputValue}
        onChange={setInputValue}
        underlineOnFocus={true} // Optional prop, defaults to true
      />
      <TextField
        value={inputValue}
        onChange={setInputValue}
        underlineOnFocus={true} // Optional prop, defaults to true
      />
      <p>Entered Value: {inputValue}</p>
    </div>
  );
};

export default ExampleForm;
