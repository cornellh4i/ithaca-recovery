"use client";

import React from "react";
import TextButton from "../components/atoms/textbutton/index";
import Dropdown from "../components/atoms/drop-down/index";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';

const MeetingsPage = () => {
  const createMeeting = () => {
    console.log("Creating a new meeting...");
  };

  return (
    <div style={{ padding: "30px" }}>
      {/* <div>Look at all meetings here!</div> */}
      <div>
        <TextButton onClick={createMeeting} label="New Meeting" icon={<FontAwesomeIcon icon={faPlus} />} />
      </div>
    </div>
  );
};

export default MeetingsPage;
