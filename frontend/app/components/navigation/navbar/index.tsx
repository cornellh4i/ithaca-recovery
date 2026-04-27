"use client";

import React from "react";
import Link from "next/link";
import Logo from "./logo";
import type { Session } from "next-auth";
import styles from "../../../../styles/Navbar.module.scss";

interface NavbarProps {
    session: Session | null;
}

const Navbar: React.FC<NavbarProps> = ({ session }) => {
    return (
        <>
            <div className={styles.navbar}>
                <div className={styles.navcontainer}>
                    <Logo />
                    <ul className={styles.navigationlist}>
                        <li className="btn btn-ghost">
                            <Link href="/meetings">
                                <p>Meetings</p>
                            </Link>
                        </li>
                        <li className="btn btn-ghost">
                            <Link href="/createmeeting">
                                <p>Create a Meeting</p>
                            </Link>
                        </li>
                        <li className="btn btn-ghost">
                            <Link href="/test">
                                <p>Testing Endpoints</p>
                            </Link>
                        </li>
                        {!session && (
                            <li className="btn btn-ghost">
                                <a href="/api/auth/signin/google">
                                    <p>Sign In</p>
                                </a>
                            </li>
                        )}
                        {session && (
                            <li className="btn btn-ghost">
                                <a href="/api/auth/signout">
                                    <p>Sign Out</p>
                                </a>
                            </li>
                        )}
                    </ul>
                    {session?.user && (
                        <div className={styles.welcome}>
                            <p>Welcome, {session.user.name}</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default Navbar;
