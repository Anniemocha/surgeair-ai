import { useMemo, useState } from "react";
import { useListPassengers } from "@workspace/api-client-react";
import { ArrowRight, Compass, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type PassengerScenario = {
  bookingReference: string;
  passengerName: string;
  travelers: number;
  origin: string;
  destination: string;
  originalFlight: { flightNumber: string; departure: string; arrival: string; status: string; delayMinutes: number };
  disruptionReason: string;
  revisedDeparture?: string | null;
  revisedArrival?: string | null;
  terminal?: string | null;
  scenarioType: string;
  suggestedRequirement?: string | null;
};

type Props = {
  activeReference: string;
  pending: boolean;
  onSelect: (reference: string) => Promise<void>;
};

export function PassengerExplorer({ activeReference, pending, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useListPassengers();
  const passengers = (Array.isArray(data) ? data : []) as PassengerScenario[];
  const selected = passengers.find(p => p.bookingReference === selectedReference);
  const filtered = useMemo(() => passengers.filter(p =>
    `${p.passengerName} ${p.bookingReference} ${p.origin} ${p.destination} ${p.scenarioType} ${p.originalFlight.flightNumber}`
      .toLowerCase().includes(search.trim().toLowerCase())
  ), [passengers, search]);

  const select = async (reference: string) => {
    const normalized = reference.trim().toUpperCase();
    if (!normalized) { setError("Enter a booking reference first."); return; }
    setError("");
    if (normalized === activeReference) { setOpen(false); return; }
    try {
      await onSelect(normalized);
      setOpen(false);
      setManual("");
      setSearch("");
    } catch {
      setError("Could not open that booking. Check the reference and try again.");
    }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="h-9 gap-2 border-primary/25 bg-card font-semibold text-primary shadow-sm hover:bg-primary/10" data-testid="btn-open-passenger-explorer">
        <Users className="h-4 w-4" /> <span className="hidden sm:inline">Passenger Explorer</span><span className="sm:hidden">Explore</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto border-border bg-background p-0 sm:rounded-[1.75rem]">
      <DialogHeader className="surge-rail border-b border-border px-5 py-6 text-left sm:px-8">
        <div className="surge-kicker mb-2 flex items-center gap-2 text-[10px] font-bold text-primary"><Compass className="h-4 w-4" /> Scenario library / live session</div>
        <DialogTitle className="surge-heading text-3xl font-bold text-foreground sm:text-4xl">Choose a journey.</DialogTitle>
        <DialogDescription className="max-w-xl text-sm leading-relaxed text-muted-foreground">Explore fictional passenger disruptions. Switching resets the conversation for this session; it never sends a message or changes a booking.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 p-5 sm:p-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, route, flight, or reference" className="h-11 bg-card pl-10 pr-10" data-testid="input-search-passengers" />
          {search && <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" data-testid="btn-clear-search"><X className="h-4 w-4" /></button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />)}
          {isError && <div className="col-span-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm"><p className="font-semibold text-destructive">Passenger library unavailable.</p><Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-3" data-testid="btn-retry-passengers">Try again</Button></div>}
          {!isLoading && !isError && filtered.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{search ? "No matching journeys. Try a different search or enter a reference below." : "No journeys in the library yet. Enter a booking reference below."}</div>}
           {!isLoading && !isError && filtered.map(p => {
            const active = p.bookingReference === activeReference;
             return <button key={p.bookingReference} type="button" disabled={pending} onClick={() => setSelectedReference(p.bookingReference)} aria-pressed={selectedReference === p.bookingReference} data-testid={`btn-select-passenger-${p.bookingReference}`} className={`group surge-surface min-w-0 rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${selectedReference === p.bookingReference ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/45"}`}>
              <div className="mb-4 flex items-center justify-between gap-2"><span className="surge-kicker truncate text-[9px] font-bold text-muted-foreground">{p.scenarioType.replace(/[_-]/g, " ")}</span><span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] font-bold text-foreground">{p.bookingReference}</span></div>
              <div className="surge-heading text-xl font-bold text-foreground">{p.passengerName}</div>
               <div className="mt-1 text-xs text-muted-foreground">{p.travelers} {p.travelers === 1 ? "traveler" : "travelers"} · {p.originalFlight.flightNumber} · <span className="font-semibold text-foreground">{p.originalFlight.status}</span></div>
              <div className="mt-5 flex items-center gap-3 border-t border-border pt-4 font-mono text-lg font-bold text-primary"><span>{p.origin}</span><span className="h-px flex-1 bg-border" /><ArrowRight className="h-4 w-4" /><span>{p.destination}</span></div>
              <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.disruptionReason}</div>
               <div className="mt-4 text-[11px] font-bold text-primary">{active ? "CURRENT JOURNEY · VIEW DETAILS" : "VIEW JOURNEY DETAILS →"}</div>
            </button>;
          })}
        </div>
         {selected && <section aria-label={`${selected.passengerName} journey details`} className="rounded-2xl border border-primary/25 bg-card p-5 sm:p-6" data-testid="passenger-details">
           <div className="flex flex-wrap items-start justify-between gap-3">
             <div><p className="surge-kicker text-[10px] font-bold text-primary">Journey details / {selected.bookingReference}</p><h3 className="surge-heading mt-1 text-2xl font-bold text-foreground">{selected.passengerName}</h3><p className="text-xs text-muted-foreground">{selected.travelers} {selected.travelers === 1 ? "traveler" : "travelers"} · {selected.origin} → {selected.destination}</p></div>
             <span className="rounded-full border border-destructive/25 bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">{selected.originalFlight.status}</span>
           </div>
           <div className="mt-5 grid gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
             <div><span className="block text-xs text-muted-foreground">Original flight</span><strong>{selected.originalFlight.flightNumber}</strong></div>
             <div><span className="block text-xs text-muted-foreground">Scheduled</span><strong>{selected.originalFlight.departure} → {selected.originalFlight.arrival}</strong></div>
             {selected.revisedDeparture && <div><span className="block text-xs text-muted-foreground">Revised departure</span><strong>{selected.revisedDeparture}</strong></div>}
             {selected.revisedArrival && <div><span className="block text-xs text-muted-foreground">Revised arrival</span><strong>{selected.revisedArrival}</strong></div>}
             {selected.originalFlight.delayMinutes > 0 && <div><span className="block text-xs text-muted-foreground">Delay</span><strong>{selected.originalFlight.delayMinutes} minutes</strong></div>}
             {selected.terminal && <div><span className="block text-xs text-muted-foreground">Terminal</span><strong>{selected.terminal}</strong></div>}
           </div>
           <p className="mt-3 text-sm text-muted-foreground">{selected.disruptionReason}</p>
           <Button type="button" disabled={pending} onClick={() => void select(selected.bookingReference)} className="mt-5 w-full gap-2 sm:w-auto" data-testid="btn-test-passenger">{selected.bookingReference === activeReference ? "Continue this journey" : "Test this passenger"} <ArrowRight className="h-4 w-4" /></Button>
         </section>}
        <form onSubmit={e => { e.preventDefault(); void select(manual); }} className="rounded-2xl border border-border bg-muted/40 p-4 sm:p-5">
          <label htmlFor="manual-reference" className="surge-kicker mb-2 block text-[10px] font-bold text-muted-foreground">Have a booking reference?</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="manual-reference" value={manual} onChange={e => setManual(e.target.value.toUpperCase())} placeholder="Enter reference" className="h-10 bg-card font-mono uppercase sm:flex-1" data-testid="input-manual-reference" />
            <Button type="submit" disabled={pending || !manual.trim()} className="h-10 gap-2" data-testid="btn-open-reference">Open booking <ArrowRight className="h-4 w-4" /></Button>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-destructive" role="alert" data-testid="text-passenger-error">{error}</p>}
        </form>
      </div>
    </DialogContent>
  </Dialog>;
}