"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

interface SidebarContextValue {
    isSidebarOpen: boolean;
    toggleSidebar: () => void;
    openSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export const SidebarProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = useCallback(() => setIsSidebarOpen((prev) => !prev), []);
    const openSidebar = useCallback(() => setIsSidebarOpen(true), []);

    return (
        <SidebarContext.Provider value={{ isSidebarOpen, toggleSidebar, openSidebar }}>
            {children}
        </SidebarContext.Provider>
    );
};

export const useSidebar = (): SidebarContextValue => {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
};
