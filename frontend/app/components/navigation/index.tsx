import React from 'react';
import Navbar from "./navbar";
import { IAdmin } from "../../../util/models";
import type { AccountInfo } from "@azure/msal-node";

interface NavigationProps {
  account: AccountInfo
}

const Navigation: React.FC<NavigationProps> = ({ account }) => {
  return (
    <Navbar account={account} />
  );
};

export default Navigation;
