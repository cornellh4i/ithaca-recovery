"use client";
import React, { useState, createContext, FC } from "react";
import Navbar from "./navbar";
import { IAdmin } from "../../../util/models";
import type { AccountInfo } from "@azure/msal-node";
import { useQuery } from '@tanstack/react-query';

const fetchCreateAdmin = async (account: AccountInfo) => {
  try {
    const queryParams = new URLSearchParams({ email: account.username }).toString();
    const response = await fetch(`/api/retrieve/admin?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const admin = await response.json();
    return admin;

  } catch (error) {
    const createResponse = await fetch('/api/write/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: account.tenantId,
        name: account.name,
        email: account.username,
        privilegeMode: "Admin"
      }),
    });

    if (!createResponse.ok) {
      throw new Error('Failed to create admin');
    }
    return await createResponse.json();
  }
}

const AdminContext = createContext<IAdmin | null>(null);

interface NavigationProps {
  account: AccountInfo
}




const Navigation: FC<NavigationProps> = ({ account }) => {
  const [isOpen, setIsOpen] = useState<Boolean>(false);

  const toggle = () => {
    setIsOpen(!isOpen);
  };

  const { data: admin } = useQuery({
    queryKey: ['admin', account.username],
    queryFn: () => fetchCreateAdmin(account)
  });
  
  return (
    <AdminContext.Provider value={admin}>
      <Navbar toggle={toggle} />
    </AdminContext.Provider>
  );
};

export default Navigation;
