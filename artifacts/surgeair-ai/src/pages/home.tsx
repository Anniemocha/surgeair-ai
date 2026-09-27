import { useEffect, useState } from "react";
import {
  useGetDashboard,
  getDashboard,
  useResetDemo,
  useSelectPassenger,
  getGetDashboardQueryKey,
  getGetBookingQueryKey,
  getGetFlightStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { SimulatorPanel } from "@/components/simulator/simulator-panel";
import { PassengerExplorer } from "@/components/passenger-explorer";
import { ThemeSelector, type Theme } from "@/components/theme-selector";
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
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("surgeair-theme");
      return saved === "dark" || saved === "eye-care" ? saved : "light";
    } catch { return "light"; }
  });
  const [resetVersion, setResetVersion] = useState(0);
  const [switching, setSwitching] = useState(false);
  const { data: dashboard, isLoading, error, refetch } = useGetDashboard();
  const resetDemo = useResetDemo();
  const selectPassenger = useSelectPassenger();

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark", "eye-care");
    document.documentElement.classList.add(theme);
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("surgeair-theme", theme); } catch { /* storage can be unavailable */ }
  }, [theme]);

  const refreshScenario = async () => {
    // Fetch the new session first; refetching the previous booking after the switch yields a 404.
    const next = await getDashboard();
    queryClient.removeQueries({ queryKey: getGetBookingQueryKey(next.booking.bookingReference) });
    queryClient.removeQueries({ queryKey: getGetFlightStatusQueryKey(next.disruption.flightNumber) });
    queryClient.setQueryData(getGetDashboardQueryKey(), next);
    setResetVersion(version => version + 1);
  };

  const handleSelect = async (bookingReference: string) => {
    setSwitching(true);
    try {
      await selectPassenger.mutateAsync({ data: { bookingReference } });
      await refreshScenario();
      toast({ title: `Now exploring ${bookingReference}`, description: "A fresh scenario is ready. No message or rebooking was sent." });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not switch passenger", description: "Check the reference and try again." });
      throw e;
    } finally {
      setSwitching(false);
    }
  };

  const handleReset = async () => {
    if (!dashboard) return;

    try {
      await resetDemo.mutateAsync();
      await refreshScenario();
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
      <div className="min-h-[100dvh] w-full bg-background p-6">
        <div className="mx-auto max-w-6xl space-y-8 pt-12">
          <div className="h-9 w-52 animate-pulse rounded-xl bg-muted" />
          <div className="grid gap-8 lg:grid-cols-2"><div className="h-96 animate-pulse rounded-3xl bg-muted" /><div className="h-96 animate-pulse rounded-3xl bg-muted" /></div>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive font-medium">Failed to load operations dashboard.</p>
          <Button onClick={() => void refetch()} data-testid="btn-retry-dashboard">Try again</Button>
          <ThemeSelector theme={theme} onChange={setTheme} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col lg:flex-row bg-background">
      <header className="order-0 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 shadow-sm lg:hidden">
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
          <PassengerExplorer activeReference={dashboard.booking.bookingReference} pending={selectPassenger.isPending} onSelect={handleSelect} />
          <ThemeSelector theme={theme} onChange={setTheme} />
          <ResetDemoControl
            isResetting={resetDemo.isPending}
            onReset={handleReset}
          />
          <Badge
            variant={
              dashboard.actionStatus === "Rebooked"
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
          headerAction={<>
            <PassengerExplorer activeReference={dashboard.booking.bookingReference} pending={selectPassenger.isPending} onSelect={handleSelect} />
            <ThemeSelector theme={theme} onChange={setTheme} />
            <ResetDemoControl
              isResetting={resetDemo.isPending}
              onReset={handleReset}
            />
          </>}
        />
      </div>

      {/* Right side: Passenger Device Simulator */}
      <div className="order-1 w-full lg:order-2 lg:w-1/2 xl:w-[45%] min-h-[70dvh] lg:h-[100dvh] overflow-hidden flex flex-col relative bg-muted/30">
        <SimulatorPanel key={`${dashboard.booking.bookingReference}-${resetVersion}`} dashboard={dashboard} />
        {switching && <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm" data-testid="status-switching-passenger">
          <div className="h-6 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-52 w-72 animate-pulse rounded-[2rem] bg-muted" />
          <p className="surge-kicker text-[10px] font-bold text-primary">Opening journey</p>
        </div>}
      </div>
    </div>
  );
}