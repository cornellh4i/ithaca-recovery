import React, { useContext } from "react";
import Link from "next/link";
import Logo from "./logo"
import type { AccountInfo } from "@azure/msal-node";
import styles from "../../../../styles/Navbar.module.scss"

interface NavbarProps {
  account: AccountInfo
}

const Navbar: React.FC<NavbarProps> = ({ account }) => {
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
          </ul>
          <div className={styles.welcome}>
            <p>Welcome, {account.name}</p>
          </div>
        </div>
      </div>
      <div style={{ marginLeft: '30px', paddingBottom: '10px', paddingTop: '20px', fontSize: 'xx-large', fontFamily: 'sans-serif', color: '#065861' }}>Hello {admin && JSON.stringify(admin)}!</div>
    </>
  );
};

export default Navbar;
