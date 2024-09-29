"use client";
import React from "react";
import Button from "../components/button";

/** An About page */
const getCatFact = async () => {
  const response = await fetch("https://catfact.ninja/fact");
  console.log(response.json());
};

const handleClick = () => {
  getCatFact();
};
const About = () => {
  return (
    <>
      <Button text="hello" />
      Hello there
      <button onClick={handleClick}>cat fact</button>
    </>
  );
};

export default About;