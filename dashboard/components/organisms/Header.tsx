import { Logo } from "@/components/atoms/Logo";
import { NetBadge } from "@/components/atoms/NetBadge";

export function Header() {
  return (
    <header>
      <div className="brand">
        <Logo />
        <div>
          <div className="wm">ARCA</div>
          <div className="sub">WALLET-OWNED MEMORY</div>
        </div>
      </div>
      <NetBadge />
    </header>
  );
}
