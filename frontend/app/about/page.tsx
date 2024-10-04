"use client";
import React from "react";
import Button from "../components/button"; 

const getCatFact = async () => {
    const response = await fetch("https://catfact.ninja/fact");
    console.log(response.json());
};
  
const handleClick = () => {
  getCatFact();
};

/** An About page */
const About = () => {
  return (
    <button onClick={handleClick}>cat fact</button>
  );
};

export default About;