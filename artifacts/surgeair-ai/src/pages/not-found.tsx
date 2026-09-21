import { useLocation } from "wouter";
import { Plane, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  const [_, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 text-center space-y-6 shadow-xl border-t-4 border-t-primary">
        <div className="flex justify-center">
          <div className="relative">
            <Plane className="w-20 h-20 text-muted-foreground opacity-20" />
            <AlertTriangle className="w-8 h-8 text-destructive absolute bottom-0 right-0" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Flight Not Found</h1>
          <p className="text-muted-foreground text-sm">
            The page or resource you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <Button 
          onClick={() => setLocation("/")}
          className="w-full h-12 text-md"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Return to Dashboard
        </Button>
      </Card>
    </div>
  );
}