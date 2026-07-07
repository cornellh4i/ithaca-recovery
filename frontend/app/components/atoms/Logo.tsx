import Image from "next/image";
import IcrLogo from "../../assets/icr.png"

const Logo = () => {

  return (
    <>
        <Image
          src={IcrLogo}
          alt="Logo"
          style={{ height: '50px', width: 'auto', padding: '10px' }}
        />
    </>
  );
};

export default Logo;
