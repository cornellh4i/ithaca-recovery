"use client";
import React from "react";
import Button from "../components/button"; 

/** An About page */
const About = () => {
  return (
    <>
      <Button text="hello" />
      Hello there
      <button onClick={handleClick}>cat fact</button>
    </>
  );
};
const getCatFact = async () => {
    const response = await fetch("https://catfact.ninja/fact");
    const data = await response.json(); 
    console.log("Cat Fact:", data.fact); 
  };
  
const handleClick = () => {
    getCatFact();
  };

export default About;