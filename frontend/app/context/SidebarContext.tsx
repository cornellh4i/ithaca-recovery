"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

interface SidebarContextValue {
    isCompact: boolean;
    collapseSidebar: () => void;
    expandSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export const SidebarProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [isCompact, setIsCompact] = useState(false);

    const collapseSidebar = useCallback(() => setIsCompact(true), []);
    const expandSidebar = useCallback(() => setIsCompact(false), []);

    return (
        <SidebarContext.Provider
            value={{
                isCompact,
                collapseSidebar,
                expandSidebar,
            }}
        >
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
