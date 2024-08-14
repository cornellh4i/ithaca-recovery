import Image from "next/image";
import Link from "next/link";
import Button from "./button";
import IcrLogo from "../../../assets/icr.png"

const Logo = () => {

  return (
    <>
        <Image
          src={IcrLogo}
          alt="Logo"
          height="50"
          width="auto"
        style={{ padding: '10px' }}
        />
    </>
  );
};

export default Logo;
