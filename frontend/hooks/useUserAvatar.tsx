import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";

interface UseUserAvatarResult {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  // Real <img> when the session has a loadable avatar URL, otherwise an initial-letter
  // fallback div -- shared here (rather than recomputed per navbar variant) so the
  // imageError pre-verification effect below has exactly one copy across desktop AppNavbar
  // and MobileAppNavbar.
  userAvatar: React.ReactNode;
}

// Extracted out of AppNavbar.tsx so the mobile navbar (a separate render path, not nested
// inside the desktop one) doesn't need its own divergent copy of this logic.
export function useUserAvatar(avatarClassName: string, fallbackClassName: string): UseUserAvatarResult {
  const { data: session, status } = useSession();
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const imageUrl = session?.user?.image;
    if (!imageUrl) {
      setImageError(true);
      return;
    }

    let isCurrent = true;
    const img = new Image();
    img.src = imageUrl;

    img.onload = () => { if (isCurrent) setImageError(false); };
    img.onerror = () => { if (isCurrent) setImageError(true); };

    return () => {
      isCurrent = false;
    };
  }, [session?.user?.image]);

  const userAvatar = (
    session?.user.image && !imageError ? (
      <img
        src={session.user.image}
        alt={session.user.name ?? "User avatar"}
        title={session.user.name ?? "Account"}
        className={avatarClassName}
        onError={() => setImageError(true)}
      />
    ) : (
      <div className={fallbackClassName}>{session?.user.name?.[0] ?? "U"}</div>
    )
  );

  return { session, status, userAvatar };
}
