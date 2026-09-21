import { useState } from "react";
import {
  useGetDashboard,
  useResetDemo,
  getGetDashboardQueryKey,
  getGetBookingQueryKey,
  getGetFlightStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { SimulatorPanel } from "@/components/simulator/simulator-panel";
import { Loader2, Plane, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ResetDemoControlProps {
  isResetting: boolean;
  onReset: () => Promise<void>;
}

function ResetDemoControl({
  isResetting,
  onReset,
}: ResetDemoControlProps) {
  const [open, setOpen] = useState(false);

  const confirmReset = async () => {
    try {
      await onReset();
      setOpen(false);
    } catch {
      // The parent shows the error toast and the dialog stays open for retry.
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors"
          disabled={isResetting}
          data-testid="btn-reset-demo"
        >
          {isResetting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline" data-testid="text-reset-demo">Reset Demo</span>
          <span className="sr-only sm:hidden">Reset Demo</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="dialog-reset-demo">
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the SurgeAir demo?</AlertDialogTitle>
          <AlertDialogDescription>
            This will restore SG4821 to the original delayed SA204 scenario and
            clear the current demo conversation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting} data-testid="btn-reset-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isResetting}
            data-testid="btn-reset-confirm"
            onClick={(event) => {
              event.preventDefault();
              void confirmReset();
            }}
          >
            {isResetting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Reset Demo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [resetVersion, setResetVersion] = useState(0);
  const { data: dashboard, isLoading, error } = useGetDashboard();
  const resetDemo = useResetDemo();

  const handleReset = async () => {
    if (!dashboard) return;

    try {
      await resetDemo.mutateAsync();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: getGetBookingQueryKey(dashboard.booking.bookingReference),
        }),
        queryClient.invalidateQueries({
          queryKey: getGetFlightStatusQueryKey(
            dashboard.disruption.flightNumber,
          ),
        }),
      ]);
      setResetVersion((version) => version + 1);
      toast({
        title: "Demo reset. SG4821 is back on delayed flight SA204.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Demo reset failed",
        description:
          "Your current demo state was not changed. Please try again.",
      });
      throw new Error("Demo reset failed");
    }
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm font-medium tracking-wide animate-pulse">LOADING AIRLINE SYSTEMS...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive font-medium">Failed to load operations dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col lg:flex-row bg-background">
      <header className="order-0 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 shadow-sm lg:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-bold tracking-tight text-primary">
            <Plane className="h-5 w-5 shrink-0" />
            <span>SurgeAir AI</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
            One conversation. Every channel. A smoother journey.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ResetDemoControl
            isResetting={resetDemo.isPending}
            onReset={handleReset}
          />
          <Badge
            variant={
              dashboard.actionStatus === "COMPLETED"
                ? "default"
                : "secondary"
            }
            className="text-[9px] uppercase"
            data-testid="badge-mobile-action-status"
          >
            {dashboard.actionStatus}
          </Badge>
        </div>
      </header>

      {/* Left side: Operations Dashboard */}
      <div className="order-2 w-full lg:order-1 lg:w-1/2 xl:w-[55%] min-h-[50dvh] lg:h-[100dvh] border-b lg:border-b-0 lg:border-r border-border overflow-hidden flex flex-col bg-background">
        <DashboardPanel
          dashboard={dashboard}
          headerAction={
            <ResetDemoControl
              isResetting={resetDemo.isPending}
              onReset={handleReset}
            />
          }
        />
      </div>

      {/* Right side: Passenger Device Simulator */}
      <div className="order-1 w-full lg:order-2 lg:w-1/2 xl:w-[45%] min-h-[70dvh] lg:h-[100dvh] overflow-hidden flex flex-col relative bg-muted/30">
        <SimulatorPanel key={resetVersion} dashboard={dashboard} />
      </div>
    </div>
  );
}