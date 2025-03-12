import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export function NavigationBar() {
  return (
    <div className="w-full bg-background border-b border-border">
      <div className="container flex items-center justify-between h-12">
        {/* Left side: Live status and future pages */}
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="bg-green-500/10 text-green-500">
            Live
          </Badge>
          <nav className="flex items-center gap-4">
            <Link href="/watchlist">
              <Button variant="ghost" className="text-muted-foreground">Watchlist</Button>
            </Link>
            <Link href="/alerts">
              <Button variant="ghost" className="text-muted-foreground">Alerts</Button>
            </Link>
            <Link href="/portfolio">
              <Button variant="ghost" className="text-muted-foreground">Portfolio</Button>
            </Link>
          </nav>
        </div>

        {/* Right side: Auth buttons */}
        <div className="flex items-center gap-2">
          <Link href="/auth?mode=login">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link href="/auth?mode=register">
            <Button>Sign up</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}