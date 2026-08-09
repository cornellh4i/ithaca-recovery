import Image from "next/image";
import IcrLogo from "../../assets/icr.png"

interface LogoProps {
  height?: number;
}

const Logo = ({ height = 50 }: LogoProps) => {

  return (
    <>
        <Image
          src={IcrLogo}
          alt="Logo"
          style={{ height: `${height}px`, width: 'auto', padding: '6px' }}
        />
    </>
  );
};

export default Logo;
