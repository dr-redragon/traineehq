import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-4 text-center">
        <p className="font-display text-6xl font-extrabold tracking-[-0.04em]">404</p>
        <p className="text-sm text-muted-foreground">There is nothing at this address.</p>
        <Button asChild><Link to="/registers">Your registers</Link></Button>
      </div>
    </div>
  );
}
