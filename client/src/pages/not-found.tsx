import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/"><Button variant="outline">← Back home</Button></Link>
    </div>
  );
}
