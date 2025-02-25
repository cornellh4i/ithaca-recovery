"use client";
import React from "react";
import Button from "../components/button";

/** An About page */
const About = () => {
  
  const getCatFact = async() => {
    const response = await fetch("https://catfact.ninja/fact");
    console.log(response.json());
  };
  
  const handleClick = () => {
    getCatFact();
  }

  return (
    <>
      <Button text="Hello There" hi="hi"/>
      <button onClick={handleClick}>cat fact</button>
    </>
    
  )
};

export default About;