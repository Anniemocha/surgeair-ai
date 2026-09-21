import { Dashboard, Activity } from "@workspace/api-client-react";
import { useGetBooking, useGetFlightStatus } from "@workspace/api-client-react";
import { format } from "date-fns";
import { 
  Plane, 
  Clock, 
  AlertCircle, 
  User, 
  Ticket,
  Activity as ActivityIcon,
  MapPin,
  Brain,
  Network,
  CheckCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

function displayTime(value: string) {
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "HH:mm:ss");
}

function providerLabel(provider: string) {
  return provider === "amazon-bedrock" ? "Amazon Bedrock" : "Local Model";
}

function modelStatusLabel(status: string) {
  switch (status) {
    case "connected":
      return "Connected / Successful";
    case "fallback":
      return "Local / Fallback";
    case "error":
      return "Error";
    default:
      return "Local / Simulation";
  }
}

interface DashboardPanelProps {
  dashboard: Dashboard;
}

export function DashboardPanel({ dashboard }: DashboardPanelProps) {
  const { activities, confirmationStatus, actionStatus, orchestration, integrationStatus } = dashboard;
  
  const { data: liveBooking } = useGetBooking(dashboard.booking.bookingReference);
  const { data: liveDisruption } = useGetFlightStatus(dashboard.disruption.flightNumber);

  const booking = liveBooking || dashboard.booking;
  const disruption = liveDisruption || dashboard.disruption;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Top navbar */}
      <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 text-primary font-bold tracking-tight">
          <Plane className="h-5 w-5" />
          <span>SURGE<span className="text-secondary">AIR</span> OPS</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={actionStatus === 'COMPLETED' ? 'default' : 'secondary'} className="uppercase text-xs tracking-wider">
            {actionStatus}
          </Badge>
        </div>
      </header>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-12">
          
          {/* Passenger Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm border-t-4 border-t-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2 uppercase tracking-wide">
                  <User className="h-4 w-4" />
                  Passenger Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{booking.passengerName}</div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  <Ticket className="h-3.5 w-3.5" />
                  PNR: <span className="font-medium text-foreground">{booking.bookingReference}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-t-4 border-t-destructive">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2 uppercase tracking-wide">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Current Disruption
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-destructive">{disruption.flightNumber} Delayed</div>
                <div className="text-sm mt-1 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive font-medium">{disruption.delayMinutes} min delay</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Itinerary */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-sm font-medium flex items-center gap-2 uppercase tracking-wide">
                <MapPin className="h-4 w-4" />
                Active Itinerary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-3xl font-bold tracking-tighter">{booking.currentFlight.origin}</span>
                  <span className="text-sm text-muted-foreground mt-1">
                    {booking.currentFlight.departure}
                  </span>
                </div>

                <div className="flex-1 flex flex-col items-center px-4 relative">
                  <div className="w-full h-px bg-border absolute top-1/2 -translate-y-1/2 z-0" />
                  <div className="bg-background px-2 z-10 text-muted-foreground text-xs font-medium border border-border rounded-full flex items-center gap-1">
                    <Plane className="h-3 w-3" />
                    {booking.currentFlight.flightNumber}
                  </div>
                  <span className="text-xs text-muted-foreground mt-2">{booking.currentFlight.aircraft || "Aircraft"} • Gate {booking.currentFlight.gate || "TBD"}</span>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-3xl font-bold tracking-tighter">{booking.currentFlight.destination}</span>
                  <span className="text-sm text-muted-foreground mt-1">
                    {booking.currentFlight.arrival}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Orchestration */}
          <Card className="shadow-sm border-t-4 border-t-secondary">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-sm font-medium flex items-center gap-2 uppercase tracking-wide">
                <Brain className="h-4 w-4 text-secondary" />
                AI Agent Orchestration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                 <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Conversation ID</p>
                  <p className="font-mono text-sm text-foreground bg-muted/30 px-2 py-1 rounded inline-block">
                    {orchestration.conversationId}
                  </p>
                 </div>

                 <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Active Channel</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 shadow-none border-0">
                      {orchestration.currentChannel}
                    </Badge>
                    {orchestration.previousChannel && (
                      <>
                        <span className="text-[10px] text-muted-foreground uppercase">Prev:</span>
                        <Badge variant="secondary" className="opacity-70 shadow-none">
                          {orchestration.previousChannel}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Agent State</p>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
                    </span>
                    <span className="text-sm font-medium">{orchestration.currentAgentState}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Current Intent</p>
                  <p className="text-sm font-medium">{orchestration.currentIntent || 'Processing...'}</p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Last Tool Called</p>
                  {orchestration.lastToolCalled ? (
                    <div className="inline-flex items-center gap-2 font-mono text-xs bg-muted px-2.5 py-1.5 rounded-md border border-border">
                      <Network className="h-3 w-3 text-muted-foreground" />
                      {orchestration.lastToolCalled}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No tools called yet</span>
                  )}
                </div>

                 <div className="sm:col-span-2 border-t border-border/50 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                   <div className="space-y-1.5">
                     <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Model Provider</p>
                     <p className="text-sm font-medium">{providerLabel(orchestration.modelProvider)}</p>
                   </div>
                   <div className="space-y-1.5">
                     <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Model</p>
                     <p className="text-sm font-medium">{orchestration.model}</p>
                   </div>
                   <div className="space-y-1.5">
                     <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Region</p>
                     <p className="text-sm font-medium">{orchestration.region || "—"}</p>
                   </div>
                   <div className="space-y-1.5">
                     <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Model Status</p>
                     <p className="text-sm font-medium">{modelStatusLabel(orchestration.modelStatus)}</p>
                   </div>
                   {orchestration.modelLatencyMs !== null && (
                     <div className="space-y-1.5">
                       <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Latency</p>
                       <p className="text-sm font-medium">{orchestration.modelLatencyMs} ms</p>
                     </div>
                   )}
                   {orchestration.modelFallbackReason && (
                     <div className="col-span-2 md:col-span-4 text-xs text-destructive">
                       Fallback: {orchestration.modelFallbackReason}
                     </div>
                   )}
                 </div>
              </div>
            </CardContent>
          </Card>

          {/* System Readiness */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-sm font-medium flex items-center gap-2 uppercase tracking-wide">
                <Network className="h-4 w-4" />
                Integration Readiness
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {integrationStatus.map((integration, idx) => {
                   const isHealthy = ['HEALTHY', 'READY', 'ONLINE', 'ACTIVE', 'CONNECTED'].includes(integration.status.toUpperCase());
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col gap-1 p-3 rounded-lg border transition-colors ${
                        isHealthy ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/30' : 'bg-destructive/5 border-destructive/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isHealthy ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        )}
                        <span className="text-xs font-semibold leading-tight line-clamp-1 truncate" title={integration.service}>
                          {integration.service}
                        </span>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider font-medium pl-5 ${
                        isHealthy ? 'text-emerald-700/80 dark:text-emerald-400/80' : 'text-destructive/80'
                      }`}>
                        {integration.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2 uppercase tracking-wide">
                <ActivityIcon className="h-4 w-4" />
                Operations Log
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                LIVE
              </Badge>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="relative border-l-2 border-muted ml-3 space-y-6">
                {activities.map((activity: Activity, i: number) => (
                  <div key={activity.id} className="relative pl-6">
                    <div className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-background ${
                      activity.status === 'COMPLETED' ? 'bg-primary' :
                      activity.status === 'PENDING' ? 'bg-secondary' : 'bg-muted-foreground'
                    }`} />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{activity.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {displayTime(activity.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{activity.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
        </div>
      </ScrollArea>
    </div>
  );
}
