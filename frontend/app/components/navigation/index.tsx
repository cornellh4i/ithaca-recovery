"use client";

import React from "react";
import Navbar from "./navbar";
import type { Session } from "next-auth";

interface NavigationProps {
    session: Session | null;
}

const Navigation: React.FC<NavigationProps> = ({ session }) => {
    return <Navbar session={session} />;
};

export default Navigation;
