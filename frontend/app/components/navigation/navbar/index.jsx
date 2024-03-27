import React from "react";
import Link from "next/link";
import Button from "./button";
import Logo from "./logo"
import styles from "../../../../styles/Navbar.module.scss"

const Navbar = ({toggle}) => {
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
        </div>
      </div>
    </>
  );
};

export default Navbar;
