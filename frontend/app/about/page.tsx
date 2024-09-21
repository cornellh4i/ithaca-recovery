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
    <>
      <Button text="hello" />
      Hello there
      <button onClick={handleClick}>cat fact</button>
      <div className="bg-black">Hello</div>
    </>
  );
};

export default About;