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
import type { DemoStatus } from "@/components/demo-presentation";

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
    case "not-invoked":
      return "Not invoked yet";
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

function airportCity(code: string) {
  const cities: Record<string, string> = {
    LIS: "Lisbon",
    EDI: "Edinburgh",
    LHR: "London Heathrow",
    LGW: "London Gatwick",
    JFK: "New York",
    CDG: "Paris",
    AMS: "Amsterdam",
    FRA: "Frankfurt",
    MAD: "Madrid",
    DUB: "Dublin",
    BCN: "Barcelona",
    FCO: "Rome",
  };
  return cities[code] ?? code;
}

function readinessStyle(status: string) {
  switch (status.toUpperCase()) {
    case "CONNECTED":
    case "INVOKED":
      return {
        icon: "text-emerald-600 dark:text-emerald-500",
        card: "bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/30",
        text: "text-emerald-700/80 dark:text-emerald-400/80",
      };
    case "SIMULATED":
      return {
        icon: "text-sky-600 dark:text-sky-400",
        card: "bg-sky-50/50 border-sky-100 dark:bg-sky-950/10 dark:border-sky-900/30",
        text: "text-sky-700/80 dark:text-sky-400/80",
      };
    case "ERROR":
      return {
        icon: "text-destructive",
        card: "bg-destructive/5 border-destructive/20",
        text: "text-destructive/80",
      };
    default:
      return {
        icon: "text-amber-600 dark:text-amber-400",
        card: "bg-amber-50/50 border-amber-100 dark:bg-amber-950/10 dark:border-amber-900/30",
        text: "text-amber-700/80 dark:text-amber-400/80",
      };
  }
}

interface DashboardPanelProps {
  dashboard: Dashboard;
  headerAction?: React.ReactNode;
  displayStatus: DemoStatus;
}

export function DashboardPanel({ dashboard, headerAction, displayStatus }: DashboardPanelProps) {
  const {
    activities,
    confirmationStatus,
    actionStatus,
    orchestration,
    integrationStatus,
    selectedAlternative,
  } = dashboard;
  
  const { data: liveBooking } = useGetBooking(dashboard.booking.bookingReference);
  const { data: liveDisruption } = useGetFlightStatus(dashboard.disruption.flightNumber);

  const booking = liveBooking || dashboard.booking;
  const disruption = liveDisruption || dashboard.disruption;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Top navbar */}
      <header className="min-h-20 border-b border-border bg-card px-6 hidden lg:flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex flex-col">
           <div className="surge-heading flex items-center gap-2 text-primary font-bold tracking-tight text-xl">
            <Plane className="h-5 w-5" />
            <span>SurgeAir AI</span>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline-block font-medium">
            One conversation. Every channel. A smoother journey.
          </span>
        </div>
        <div className="flex items-center gap-3">
          {headerAction}
          <Badge variant={displayStatus === 'Rebooked' ? 'default' : 'secondary'} className={`text-[10px] font-bold tracking-wider ${displayStatus === "Rebooked" ? "bg-emerald-600 text-white" : ""}`} aria-live="polite" data-testid="badge-action-status">
            {displayStatus}
          </Badge>
        </div>
      </header>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-12">
          <div className="surge-rail relative overflow-hidden rounded-3xl border border-border px-6 py-6 sm:px-8">
            <div className="surge-flightline pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-50" />
            <p className="surge-kicker relative text-[10px] font-bold text-primary">Operations / Active journey</p>
            <h1 className="surge-heading relative mt-2 text-3xl font-bold leading-tight text-foreground sm:text-4xl">A clearer way forward.</h1>
            <p className="relative mt-2 text-sm text-muted-foreground">Follow the disruption, conversation, and next steps for <strong className="text-foreground">{booking.passengerName}</strong>.</p>
          </div>
          
          {/* Passenger Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="surge-surface border-0 bg-primary text-primary-foreground">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-primary-foreground/70 font-bold">Passenger</p>
                    <div className="text-xl font-bold tracking-tight" data-testid="text-passenger-name">{booking.passengerName}</div>
                  </div>
                  <User className="h-5 w-5 text-primary-foreground/50" />
                </div>
                <div className="mt-4 pt-4 border-t border-primary-foreground/10 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-primary-foreground/80">
                    <Ticket className="h-3.5 w-3.5" />
                    <span>PNR:</span>
                    <span className="font-bold text-primary-foreground tracking-widest" data-testid="text-booking-reference">{booking.bookingReference}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] border-primary-foreground/20 text-primary-foreground/90 uppercase">Verified</Badge>
                </div>
              </CardContent>
            </Card>

             <Card className="surge-surface border border-destructive/20 bg-destructive/10 border-l-4 border-l-destructive">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-destructive/80 font-bold">Current Disruption</p>
                     <div className="text-xl font-bold tracking-tight text-destructive" data-testid="text-disruption-flight">{disruption.flightNumber} {disruption.status}</div>
                  </div>
                  <AlertCircle className="h-5 w-5 text-destructive/50" />
                </div>
                <div className="mt-4 pt-4 border-t border-destructive/10 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-destructive/80" />
                   <span className="text-sm font-bold text-destructive/90" data-testid="text-delay-minutes">{disruption.delayMinutes > 0 ? `${disruption.delayMinutes} min delay` : disruption.status}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Itinerary */}
             <Card className="surge-surface border border-border/70 bg-card overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary via-secondary to-primary" />
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-xs font-semibold flex items-center justify-between uppercase tracking-wide text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Active Itinerary
                </div>
                <Badge
                  variant="outline"
                  className="text-[9px] bg-muted/50"
                  data-testid="badge-booking-status"
                >
                  {booking.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-4xl font-bold tracking-tighter" data-testid="text-origin">{booking.currentFlight.origin}</span>
                  <span className="text-xs text-muted-foreground">
                    {airportCity(booking.currentFlight.origin)}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium mt-0.5" data-testid="text-departure">
                    {booking.currentFlight.departure}
                  </span>
                </div>

                <div className="flex-1 flex flex-col items-center px-4 md:px-8 relative">
                  <div className="w-full h-px bg-border absolute top-1/2 -translate-y-1/2 z-0 border-dashed border-t-2" />
                  <div className="bg-card px-3 py-1 z-10 text-primary text-xs font-bold border-2 border-primary/10 rounded-full flex items-center gap-1.5 shadow-sm" data-testid="text-current-flight">
                    <Plane className="h-3.5 w-3.5" />
                    {booking.currentFlight.flightNumber}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-3">
                    {booking.currentFlight.aircraft || "Aircraft"} • Gate {booking.currentFlight.gate || "TBD"}
                  </span>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-4xl font-bold tracking-tighter" data-testid="text-destination">{booking.currentFlight.destination}</span>
                  <span className="text-xs text-muted-foreground">
                    {airportCity(booking.currentFlight.destination)}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium mt-0.5" data-testid="text-arrival">
                    {booking.currentFlight.arrival}
                  </span>
                </div>
              </div>
              {confirmationStatus === "Awaiting passenger confirmation" &&
                selectedAlternative && (
                  <div
                    className="mt-5 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100"
                    data-testid="status-awaiting-confirmation"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <Clock className="h-3.5 w-3.5" />
                      {selectedAlternative} selected — awaiting confirmation
                    </div>
                    <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200/80">
                       {booking.bookingReference} remains booked on {booking.currentFlight.flightNumber} until the passenger confirms.
                    </p>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* AI Orchestration - Technical details visually secondary */}
          <Card className="shadow-sm border-0 bg-card">
            <CardHeader className="pb-2 pt-3 border-b border-border/50 bg-muted/30">
              <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                <Brain className="h-3 w-3 text-secondary" />
                AI Agent Orchestration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4">
                 <div className="space-y-1">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Conversation ID</p>
                  <p className="font-mono text-[10px] text-foreground truncate" title={orchestration.conversationId} data-testid="text-conversation-id">
                    {orchestration.conversationId}
                  </p>
                 </div>

                 <div className="space-y-1">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Active Channel</p>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 shadow-none border-0 text-[10px] h-4 py-0" data-testid="badge-active-channel">
                      {orchestration.currentChannel}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1 col-span-2 md:col-span-2">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Agent State</p>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-secondary"></span>
                    </span>
                    <span className="text-[11px] font-medium leading-none" data-testid="text-agent-state">{orchestration.currentAgentState}</span>
                  </div>
                </div>

                <div className="space-y-1 col-span-2">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Current Intent</p>
                  <p className="text-[11px] font-medium truncate" data-testid="text-current-intent">{orchestration.currentIntent || 'Awaiting passenger reply'}</p>
                </div>

                <div className="space-y-1 col-span-2">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Last Tool Called</p>
                  {orchestration.lastToolCalled ? (
                    <div className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground" data-testid="text-last-tool">
                      <Network className="h-3 w-3" />
                      {orchestration.lastToolCalled}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 italic">No tools called yet</span>
                  )}
                </div>

                <div className="space-y-1 col-span-2">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Turn execution</p>
                  <p className="text-[11px] font-medium" data-testid="text-execution-path">{orchestration.executionPath ?? "Not invoked yet"}</p>
                  {orchestration.runtimeSessionId && <p className="break-all font-mono text-[9px] text-muted-foreground" data-testid="text-runtime-session">Session: {orchestration.runtimeSessionId}</p>}
                </div>
                 <div className="col-span-2 md:col-span-4 pt-2 mt-1 border-t border-border/30 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 opacity-75">
                   <div className="space-y-0.5">
                     <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Provider</p>
                     <p className="text-[10px] font-medium truncate" data-testid="text-model-provider">
                       {providerLabel(orchestration.modelProvider)}
                     </p>
                   </div>
                   <div className="space-y-0.5">
                     <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Model</p>
                     <p className="text-[10px] font-medium truncate">{orchestration.model}</p>
                   </div>
                   <div className="space-y-0.5">
                     <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Region</p>
                     <p className="text-[10px] font-medium truncate" data-testid="text-model-region">
                       {orchestration.region || "—"}
                     </p>
                   </div>
                   <div className="space-y-0.5">
                     <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Status</p>
                     <p className="text-[10px] font-medium truncate">{modelStatusLabel(orchestration.modelStatus)}</p>
                   </div>
                   {orchestration.modelLatencyMs !== null && (
                     <div className="space-y-0.5">
                       <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Latency</p>
                       <p className="text-[10px] font-medium truncate">{orchestration.modelLatencyMs} ms</p>
                     </div>
                   )}
                 </div>
              </div>
              {!!orchestration.turnHistory?.length && (
                <details className="mt-3 border-t border-border/30 pt-2 text-[10px]" data-testid="orchestration-details">
                  <summary className="cursor-pointer text-muted-foreground">Execution details</summary>
                  <div className="mt-2 space-y-3">
                    {orchestration.turnHistory.map((turn, index) => (
                      <div key={`${turn.timestamp}-${index}`}>
                        <p className="font-medium">Turn {index + 1}: {turn.path}</p>
                        <p className="text-muted-foreground">{displayTime(turn.timestamp)}</p>
                        <p className="break-all font-mono text-muted-foreground">Session: {turn.runtimeSessionId}</p>
                        {(turn.fallbackError || turn.fallbackReason) && (
                          <pre className="mt-1 whitespace-pre-wrap break-words font-mono" data-testid="text-agentcore-error">{turn.fallbackError ?? turn.fallbackReason}</pre>
                        )}
                      </div>
                    ))}
                    {orchestration.modelFallbackReason && <p className="whitespace-pre-wrap break-words">Bedrock detail: {orchestration.modelFallbackReason}</p>}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          {/* System Readiness */}
          <Card className="shadow-sm border-0 bg-card">
            <CardHeader className="pb-3 pt-4 border-b border-border/50 bg-muted/30">
              <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
                <Network className="h-3.5 w-3.5" />
                Integration Readiness
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                {integrationStatus.map((integration, idx) => {
                   const style = readinessStyle(integration.status);
                   const isConnected = ["CONNECTED", "INVOKED"].includes(integration.status.toUpperCase());
                  return (
                    <div
                      key={idx}
                      data-testid={`card-readiness-${integration.service.toLowerCase().replace(/\s+/g, '-')}`}
                       className={`flex flex-col gap-1 p-2.5 rounded-lg border transition-colors ${style.card}`}
                    >
                      <div className="flex items-center gap-2">
                         {isConnected ? (
                           <CheckCircle className={`h-3 w-3 shrink-0 ${style.icon}`} />
                        ) : (
                           <AlertCircle className={`h-3 w-3 shrink-0 ${style.icon}`} />
                        )}
                        <span className="min-w-0 text-xs font-semibold leading-snug break-words" title={integration.service}>
                          {integration.service === "AWS End User Messaging SMS" ? "AWS End User Messaging" : integration.service}
                        </span>
                      </div>
                       <span className={`text-[9px] uppercase tracking-wider font-bold pl-5 ${style.text}`}>
                         {integration.status}
                      </span>
                       {integration.invokedAt && <span className="pl-5 text-[10px] text-muted-foreground" title={integration.invokedAt}>First invoked {displayTime(integration.invokedAt)}</span>}
                       {integration.service === "AWS End User Messaging SMS" ? (
                         <span className="pl-5 text-[10px] leading-tight text-muted-foreground" title={integration.detail ?? undefined}>
                           AWS SMS Simulator
                         </span>
                       ) : integration.detail || /SES/i.test(integration.service) ? (
                         <span className="text-[10px] text-muted-foreground pl-5 leading-snug break-words" title={integration.detail ?? undefined}>
                           {/SES/i.test(integration.service) ? "Email (SES sandbox, verified recipient)" : /WhatsApp|RCS/i.test(integration.service) ? "Simulated" : integration.detail}
                         </span>
                       ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <details className="rounded-xl border border-border/50 bg-card px-4 py-3" data-testid="tool-calls">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool calls</summary>
            <ul className="mt-3 space-y-2 text-xs">
              {activities.filter(activity => activity.label.startsWith("Tool call: ")).map(activity => <li key={activity.id}>
                <strong>{activity.label.slice("Tool call: ".length)}</strong>
                <span className="ml-2 text-[10px] text-muted-foreground">{displayTime(activity.timestamp)}</span>
                <p className="break-words text-muted-foreground">{activity.detail}</p>
              </li>)}
              {!activities.some(activity => activity.label.startsWith("Tool call: ")) && <li className="text-muted-foreground">No tools called in this run.</li>}
            </ul>
          </details>

          {/* Activity Timeline */}
          <Card className="shadow-sm border-0 bg-card">
            <CardHeader className="pb-3 pt-4 border-b border-border/50 bg-muted/30 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
                <ActivityIcon className="h-3.5 w-3.5" />
                Operations Log
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Live</span>
              </div>
            </CardHeader>
            <CardContent className="pt-6 pb-6">
              <div className="relative border-l-2 border-muted ml-3 space-y-6">
                {activities.filter(activity => !activity.label.startsWith("Tool call: ")).map((activity: Activity, i: number) => (
                  <div key={activity.id} className="relative pl-6" data-testid={`timeline-activity-${i}`}>
                    <div className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-[3px] border-card ${
                      activity.status === 'COMPLETED' ? 'bg-primary' :
                      activity.status === 'PENDING' ? 'bg-secondary' : 'bg-muted-foreground'
                    }`} />
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold tracking-tight">{activity.label}</span>
                        <span className="text-[10px] font-mono text-muted-foreground font-medium bg-muted/50 px-1.5 py-0.5 rounded">
                          {displayTime(activity.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/80 font-medium">{activity.detail}</p>
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
