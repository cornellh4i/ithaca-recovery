import React from "react";

/**
 * Component for a general button
 * @param text is the text on the button
 */

interface Props {
  text: string;
  hi?: string;
}

const Button = ({ text, hi }: Props) => {
  return <button>{text} {hi}</button>;
};

export default Button;