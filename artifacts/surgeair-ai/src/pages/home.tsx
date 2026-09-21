import { useState, useEffect, useRef } from "react";
import { 
  useGetDashboard,
  useSearchAlternativeFlights,
  useRebookFlight,
  useSendItinerary,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { SimulatorPanel } from "@/components/simulator/simulator-panel";
import { Loader2 } from "lucide-react";

export function Home() {
  const { data: dashboard, isLoading, error } = useGetDashboard();
  
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
      {/* Left side: Operations Dashboard */}
      <div className="w-full lg:w-1/2 xl:w-[55%] min-h-[50dvh] lg:h-[100dvh] border-b lg:border-b-0 lg:border-r border-border overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-900/20">
        <DashboardPanel dashboard={dashboard} />
      </div>

      {/* Right side: Passenger Device Simulator */}
      <div className="w-full lg:w-1/2 xl:w-[45%] min-h-[70dvh] lg:h-[100dvh] overflow-hidden flex flex-col relative">
        <SimulatorPanel dashboard={dashboard} />
      </div>
    </div>
  );
}