import React from "react";

interface BoxProps {
  boxType: 'Meeting Block' | 'Room Block';
  title: string;
  bgColor: string;
  time?: string; // For Meeting Block
  tags?: string[]; // For badges like "Hybrid", "AA"
  [key: string]: any;
};

const BoxText = ({ boxType, title, bgColor, time, tags, ...props }: BoxProps) => {
  if (boxType === 'Meeting Block') {
    // TODO
  } else if (boxType === 'Room Block') {
    // return (
    //   <div className={`max-w-sm mx-auto my-4 p-4 ${bgColor} rounded-lg shadow-md`}>
    //     <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
    //   </div>
    // );
    return (
      <div
        className="p-4 border-4 border-blue-500 rounded-lg shadow-md"  // added border formatting here
        style={{ backgroundColor: bgColor }}  // assuming you're passing a color code like "#c3f4c6"
      >
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>
    );
  }

  return (<></>);
};

export default BoxText;
