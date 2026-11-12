import Image from "next/image";
import IcrLogo from "../../../assets/icr.png"

interface LogoProps {
  height?: number;
}

const Logo = ({ height = 50 }: LogoProps) => {

  return (
    <>
        <Image
          src={IcrLogo}
          alt="Logo"
          // filter: the PNG is black on transparent -- dark mode inverts it (see --logo-filter).
          style={{ height: `${height}px`, width: 'auto', padding: '6px', filter: 'var(--logo-filter)' }}
        />
    </>
  );
};

export default Logo;
