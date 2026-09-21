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
  MapPin
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function displayTime(value: string) {
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "HH:mm:ss");
}

interface DashboardPanelProps {
  dashboard: Dashboard;
}

export function DashboardPanel({ dashboard }: DashboardPanelProps) {
  const { activities, confirmationStatus, actionStatus } = dashboard;
  
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