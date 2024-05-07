import React, { useContext } from "react";
import Link from "next/link";
import Button from "./button";
import Logo from "./logo"
import styles from "../../../../styles/Navbar.module.scss"
import AdminContext from '../index.tsx'
import Navigation from "../index.tsx";

const Navbar = ({ toggle }) => {
  const admin = useContext(AdminContext);
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
            <li className="btn btn-ghost">
              <Link href="/admintesting">
                <p>Admin Testing</p>
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div style={{ marginLeft: '30px', paddingBottom: '10px', paddingTop: '20px', fontSize: 'xx-large', fontFamily: 'sans-serif', color: '#065861' }}>Hello {admin && JSON.stringify(admin)}!</div>
    </>
  );
};

export default Navbar;
