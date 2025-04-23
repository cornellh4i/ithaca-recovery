"use client";

import React from "react";
import Navbar from "./navbar";
import type { AccountInfo } from "@azure/msal-browser";

interface NavigationProps {
  account: AccountInfo | null;
  setShowSignIn?: (val: boolean) => void;
}

const Navigation: React.FC<NavigationProps> = ({ account, setShowSignIn }) => {
  return <Navbar account={account} setShowSignIn={setShowSignIn} />;
};

export default Navigation;
