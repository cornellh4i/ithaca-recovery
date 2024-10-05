"use client";

import React, { useState } from 'react';
import TextField from '../components/atoms/TextField/index'; // Import the TextField component
import RadioGroup from "../components/atoms/RadioGroup/index"; 

const ExampleForm = () => {
  const [inputValue, setInputValue] = useState(''); // State to hold the value

  const [selectedOption, setSelectedOption] = useState<string>("Option 1");

    // Function to handle the change in radio button selection
    const handleOptionChange = (option: string) => {
        setSelectedOption(option);
    };

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

      <div>
            <RadioGroup
                label="Ends"
                options={["Never", "On", "After"]}
                selectedOption={selectedOption}
                onChange={handleOptionChange}
                name="preferences"
                disabledOptions={["Option 2"]} // Disabling "Option 2"
            />
            <p>You have selected: {selectedOption}</p>
        </div>
    </div>
  );
  
};

export default ExampleForm;
