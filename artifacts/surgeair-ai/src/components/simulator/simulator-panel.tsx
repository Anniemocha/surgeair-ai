import { useState, useRef, useEffect } from "react";
import { 
  Dashboard, 
  ConversationMessage, 
  Flight,
  Booking,
  ItineraryEmailPreview
} from "@workspace/api-client-react";
import { 
  useListPassengers,
  getSearchAlternativeFlightsQueryOptions,
  usePrepareRebooking,
  useRebookFlight, 
  useSendItinerary,
  useInterpretMessage,
   useSelectConversationChannel,
  useStartDemo,
  getGetDashboardQueryKey,
  getGetBookingQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Wifi, 
  Battery, 
  Signal, 
  Send, 
  Bot, 
  Plane
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { wasItineraryEmailDelivered } from "./email-delivery-activity";
import { describeAlternatives, distinctAlternatives } from "./alternatives";
import { uniqueSuggestedReplies } from "./suggested-replies";
import { demoStatus, type DemoStatus } from "@/components/demo-presentation";
import { confirmationSummary, itineraryDeliverySummary } from "./confirmation-summary";
import { ItineraryEmail } from "./itinerary-email-preview";
import { SmsDeliveryDetails } from "./sms-delivery-details";

interface SimulatorPanelProps {
  dashboard: Dashboard;
  onStatusChange: (status: DemoStatus) => void;
}

function displayTime(value: string) {
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value.slice(0, 5);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "HH:mm");
}

export function SimulatorPanel({ dashboard, onStatusChange }: SimulatorPanelProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ConversationMessage[]>(dashboard.messages);
  const [inputValue, setInputValue] = useState("");
  const [activeChannel, setActiveChannel] = useState(dashboard.orchestration.currentChannel);
  const [channelError, setChannelError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [smsDeliveries, setSmsDeliveries] = useState(dashboard.smsDeliveries ?? []);
  const [emailPreview, setEmailPreview] = useState<ItineraryEmailPreview | undefined>(dashboard.emailPreview);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  useEffect(() => {
    setActiveChannel(dashboard.orchestration.currentChannel);
  }, [dashboard.orchestration.currentChannel]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; timers.current.forEach(clearTimeout); };
  }, []);
  const later = (callback: () => void, delay: number) => {
    timers.current.push(setTimeout(() => { if (mounted.current) callback(); }, delay));
  };
  
  // Conversation state machine
  const [isTyping, setIsTyping] = useState(false);
  const [awaitingRequirement, setAwaitingRequirement] = useState(
    dashboard.orchestration.currentAgentState === "Disruption detected" ||
      dashboard.orchestration.currentAgentState === "Booking retrieved",
  );
  const [showingOptions, setShowingOptions] = useState(
    dashboard.orchestration.currentAgentState === "Presenting alternatives",
  );
  const [alternativeFlights, setAlternativeFlights] = useState<Flight[]>([]);
  const [noSuitableOptions, setNoSuitableOptions] = useState<string | null>(null);
  const [awaitingConfirmationFor, setAwaitingConfirmationFor] = useState<string | null>(
    dashboard.confirmationStatus === "Awaiting passenger confirmation"
      ? dashboard.selectedAlternative
      : null,
  );
  const [rebookSuccess, setRebookSuccess] = useState(
    dashboard.actionStatus === "Rebooked",
  );
  const { data: scenarios } = useListPassengers();
  const scenario = (Array.isArray(scenarios) ? scenarios : []).find(
    (item: { bookingReference: string }) => item.bookingReference === dashboard.booking.bookingReference,
  ) as { suggestedRequirement?: string | null } | undefined;
  const suggestedRequirement = scenario?.suggestedRequirement?.trim() || "";
  const suggestedTime = suggestedRequirement.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0];
  const suggestedReplies = uniqueSuggestedReplies([
    ...(suggestedTime
      ? [{ label: `Arrive before ${suggestedTime}`, message: suggestedRequirement }]
      : []),
    { label: "Arrive before 20:00", message: "I need to arrive before 20:00" },
  ]);

  const rebookFlight = useRebookFlight();
  const prepareRebooking = usePrepareRebooking();
  const sendItinerary = useSendItinerary();
  const interpretMessage = useInterpretMessage();
  const selectConversationChannel = useSelectConversationChannel();
  const channels = ["SMS", "WhatsApp", "RCS", "Email"] as const;
  const emailDelivered = wasItineraryEmailDelivered(dashboard.activities) || emailPreview?.provider === "amazon-ses";
  const visibleBooking = confirmedBooking ?? dashboard.booking;
  const lastAiIndex = messages.findLastIndex(message => message.sender !== "passenger");
  const firstAiIndex = messages.findIndex(message => message.sender !== "passenger");
  const startDemo = useStartDemo();
  useEffect(() => {
    let active = true;
    startDemo.mutateAsync().then(result => {
      if (!active) return;
      setSmsDeliveries(result.smsDeliveries ?? []);
      void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    }).catch(() => {
      if (active) setSmsDeliveries([{ kind: "notification", status: "failed", messageId: null, timestamp: new Date().toISOString() }]);
    });
    return () => { active = false; };
  }, [startDemo.mutateAsync, queryClient]);
  useEffect(() => {
    if (dashboard.smsDeliveries) setSmsDeliveries(dashboard.smsDeliveries);
  }, [dashboard.smsDeliveries]);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const lastAgentMessage = [...messages].reverse().find(message => message.sender !== "passenger");
    onStatusChange(demoStatus({
      notified: messages.length > 0,
      optionsShown: showingOptions,
      selected: !!awaitingConfirmationFor,
      confirmed: rebookSuccess || dashboard.actionStatus === "Rebooked",
      emailDelivered,
      cancelled: /won't rebook|rebooking cancelled/i.test(lastAgentMessage?.text ?? ""),
    }));
  }, [messages, showingOptions, awaitingConfirmationFor, rebookSuccess, emailDelivered, dashboard.actionStatus, onStatusChange]);

  const handleSelectChannel = async (channel: "SMS" | "WhatsApp" | "RCS") => {
    setEmailOpen(false);
    if (isTyping || selectConversationChannel.isPending || activeChannel === channel) return;
    setChannelError("");
    try {
      const selected = await selectConversationChannel.mutateAsync({ data: { channel } });
      setActiveChannel(selected.currentChannel);
      await queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    } catch {
      setChannelError("Could not switch channels. Please try again.");
    }
  };

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = emailOpen ? 0 : el.scrollHeight;
    }
  }, [messages, isTyping, showingOptions, alternativeFlights, awaitingConfirmationFor, awaitingRequirement, rebookSuccess, emailOpen, emailPreview]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => { el.scrollTop = emailOpen ? 0 : el.scrollHeight; });
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [emailOpen]);

  const addMessage = (text: string, sender: 'passenger' | 'ai') => {
    const newMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      channel: activeChannel as ConversationMessage["channel"],
      sender,
      text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  };

  const handleSend = async (textOverride?: string) => {
    const textToUse = textOverride || inputValue;
    if (!textToUse.trim() || isTyping || selectConversationChannel.isPending) return;
    
    const userText = textToUse.trim();
    if (!textOverride) setInputValue("");
    
    addMessage(userText, 'passenger');
    setIsTyping(true);
    let decision: Awaited<ReturnType<typeof interpretMessage.mutateAsync>>;
    try {
      decision = await interpretMessage.mutateAsync({ data: {
        text: userText,
        bookingReference: dashboard.booking.bookingReference,
        presentedFlightNumbers: showingOptions ? alternativeFlights.map(flight => flight.flightNumber) : [],
      } });
      await queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    } catch {
      addMessage("I couldn't interpret your message right now. Please try again.", "ai");
      setIsTyping(false);
      return;
    }

    if (rebookSuccess || dashboard.actionStatus === "Rebooked") {
      try {
        if (!decision.clarification) throw new Error("Completed booking response unavailable.");
        addMessage(decision.clarification, "ai");
      } catch {
        addMessage("I couldn't check your booking right now. Please try again.", "ai");
      } finally {
        setIsTyping(false);
      }
      return;
    }

    // Authorization is checked deterministically, separately from model interpretation.
    if (awaitingConfirmationFor && /^(?:yes(?:,\s*confirm)?|confirm)(?:\s+(?:the\s+)?rebooking)?[.!]?\s*$/i.test(userText)) {
        try {
          // 1. Rebook
          const result = await rebookFlight.mutateAsync({
            data: {
              bookingReference: dashboard.booking.bookingReference,
              newFlight: awaitingConfirmationFor,
              confirmation: true
            }
          });

          setConfirmedBooking(result.booking);
          if (result.smsDelivery) setSmsDeliveries(previous => [...previous.filter(receipt => receipt.kind !== "confirmation"), result.smsDelivery!]);
          const confirmationId = addMessage(confirmationSummary(result.booking), 'ai');
           setAwaitingConfirmationFor(null);
           setShowingOptions(false);
           setRebookSuccess(true);
          
          // 2. Send Itinerary
           later(async () => {
             if (!mounted.current) return;
            setIsTyping(true);
             try {
               const sent = await sendItinerary.mutateAsync({ data: { bookingReference: dashboard.booking.bookingReference, channel: 'EMAIL' } });
               setEmailPreview(sent.emailPreview);
               setMessages(previous => previous.map(message => message.id === confirmationId
                 ? { ...message, text: `${confirmationSummary(result.booking)} ${itineraryDeliverySummary(sent)}`, timestamp: new Date().toISOString() }
                 : message));
             } catch {
               addMessage("Your flight is confirmed, but the itinerary email could not be sent. Please contact support for a copy.", "ai");
             } finally {
               await Promise.all([
                 queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
                 queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(dashboard.booking.bookingReference) }),
               ]);
               setRebookSuccess(true);
               setIsTyping(false);
             }
          }, 1000);

        } catch (e) {
          addMessage("Sorry, there was an error processing your rebooking. Please try again.", 'ai');
        }
      setIsTyping(false);
      return;
    }
    if (awaitingConfirmationFor && /^(?:no|cancel)(?:[!.,\s]|$)/i.test(userText)) {
        addMessage("Okay, I won't rebook you on that flight. Would you like to see other options?", 'ai');
        setAwaitingConfirmationFor(null);
        setAwaitingRequirement(true);
        setIsTyping(false);
        return;
    }

    try {
      // The existing backend model interprets the inbound message. Only validated,
      // session-grounded decisions can reach airline search or preparation tools.
      if (decision.clarification) {
        addMessage(decision.clarification, "ai");
        return;
      }

      if (decision.selectedFlight) {
        const selected = showingOptions
          ? alternativeFlights.find(f => f.flightNumber === decision.selectedFlight)
          : undefined;
        if (!selected) {
          addMessage("Please choose a flight from the alternatives shown for your booking.", "ai");
          return;
        }
        try {
          await prepareRebooking.mutateAsync({
            data: {
              bookingReference: dashboard.booking.bookingReference,
              newFlight: selected.flightNumber,
            },
          });
          setAwaitingConfirmationFor(selected.flightNumber);
          setShowingOptions(false);
          setAwaitingRequirement(false);
          addMessage(`You've selected ${selected.flightNumber}. Shall I go ahead and confirm this rebooking for you? Reply YES or CONFIRM.`, "ai");
          await queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        } catch {
          addMessage("Sorry, I couldn't prepare that flight for confirmation. Please choose another option.", "ai");
        }
        return;
      }

      if (showingOptions && /\b(?:which|what).*(?:earliest|soonest)\b/i.test(userText)) {
        const earliest = [...alternativeFlights].sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
        addMessage(earliest
          ? `${earliest.flightNumber} arrives earliest at ${earliest.arrival}. Your booking is unchanged. Would you like to select it?`
          : "I don't have an available option to compare.", "ai");
        return;
      }

      if (/\blater\b/i.test(userText) && /\b(?:flight|option|anything|something)\b/i.test(userText)) {
        const available = distinctAlternatives(await queryClient.fetchQuery(getSearchAlternativeFlightsQueryOptions({
          origin: dashboard.booking.origin,
          destination: dashboard.booking.destination,
        })));
        const latestDeparture = showingOptions && alternativeFlights.length
          ? [...alternativeFlights].sort((a, b) => b.departure.localeCompare(a.departure))[0].departure
          : dashboard.booking.currentFlight.departure;
        const laterFlights = available.filter(f => f.departure > latestDeparture);
        if (laterFlights.length) {
          setAlternativeFlights(laterFlights);
          setShowingOptions(true);
          setAwaitingRequirement(false);
          setNoSuitableOptions(null);
          addMessage(laterFlights.length === 1
            ? `I found one later alternative on your route: ${laterFlights[0]!.flightNumber} departs ${laterFlights[0]!.departure} and arrives ${laterFlights[0]!.arrival}. Your booking is unchanged. Would you like to select it?`
            : `Available later flights on your route: ${laterFlights.map(f => `${f.flightNumber} departs ${f.departure} and arrives ${f.arrival}`).join("; ")}. Your booking is unchanged. Which would you prefer?`, "ai");
        } else {
          addMessage("There are no later available flights on your route in the current schedule. Your booking is unchanged.", "ai");
        }
        await queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        return;
      }

      let arrivalBefore = decision.arrivalBefore;
      const earlier = /\b(?:anything|something|flight|option).*\bearlier\b|\bearlier\b/i.test(userText);
      if (!arrivalBefore && earlier && alternativeFlights.length > 0) {
        arrivalBefore = [...alternativeFlights].sort((a, b) => a.arrival.localeCompare(b.arrival))[0].arrival;
      }
      if (!arrivalBefore) {
        addMessage(awaitingRequirement
          ? "What time do you need to arrive by? Please include AM or PM if you use a 12-hour time."
          : "Tell me the arrival time you need, or choose one of the presented flights.", "ai");
        return;
      }

      const flights = distinctAlternatives(await queryClient.fetchQuery(getSearchAlternativeFlightsQueryOptions({
        origin: dashboard.booking.origin,
        destination: dashboard.booking.destination,
        arrivalBefore,
      })));
      if (flights.length > 0) {
        setNoSuitableOptions(null);
        setAlternativeFlights(flights);
        addMessage(describeAlternatives(flights, arrivalBefore), "ai");
        setAwaitingRequirement(false);
        setShowingOptions(true);
        setAwaitingConfirmationFor(null);
      } else {
        const available = distinctAlternatives(await queryClient.fetchQuery(getSearchAlternativeFlightsQueryOptions({
          origin: dashboard.booking.origin,
          destination: dashboard.booking.destination,
        })));
        setAlternativeFlights([]);
        setShowingOptions(false);
        setAwaitingRequirement(true);
        setNoSuitableOptions(arrivalBefore);
        const actualTimes = available.length
          ? ` Available alternatives: ${available.map(f => `${f.flightNumber} arrives at ${f.arrival}`).join("; ")}.`
          : " No available alternatives were returned.";
        addMessage(`There are no suitable flights arriving before ${arrivalBefore} on this route.${actualTimes} Your booking has not changed. Would you like to try a later arrival time?`, "ai");
      }
      await queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    } catch {
      addMessage("I couldn't check flight availability right now. Your booking has not changed; please try again.", "ai");
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3 items-center justify-center p-4 lg:p-5 bg-muted/30 relative">
      
      {/* Decorative background elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-12 w-72 h-72 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      <aside className="relative z-10 w-full max-w-[380px] rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-foreground" data-testid="demo-instruction">
        {dashboard.disruption.flightNumber === "SA204"
          ? "Try it: the passenger's flight SA204 is delayed. Tap 'Arrive before 18:00' to watch the agent find and rebook an alternative."
          : `Try it: explore the disruption on ${dashboard.disruption.flightNumber}. Tap an arrival-time suggestion below to see suitable alternatives.`}
      </aside>

      {/* Device Mockup */}
      <div className="w-full max-w-[380px] h-[min(760px,calc(100dvh-220px))] min-h-[440px] shrink-0 bg-background rounded-[2.5rem] shadow-[0_25px_50px_-12px_rgba(12,38,58,0.3)] border-[10px] border-primary relative flex flex-col overflow-hidden ring-1 ring-border z-10">
        
        {/* Dynamic Island / Notch area */}
        <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
          <div className="w-[120px] h-full bg-primary rounded-b-3xl"></div>
        </div>

        {/* Status Bar */}
        <div className="h-11 bg-background/95 backdrop-blur-md flex items-center justify-between px-6 pt-1 text-[11px] font-semibold z-40">
          <span>{format(clock, "HH:mm")}</span>
          <div className="flex items-center gap-1.5 opacity-80">
            <Signal className="h-3 w-3 fill-current" />
            <Wifi className="h-3 w-3" />
            <Battery className="h-4 w-4 fill-current" />
          </div>
        </div>

        {/* Chat Header */}
        <div className="px-4 pb-3 pt-2 bg-background/95 backdrop-blur-md border-b border-border/50 flex items-center gap-3 z-40 shadow-sm relative">
          <div className="bg-gradient-to-br from-primary to-secondary p-2 rounded-full text-white shadow-sm">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm leading-none">SurgeAir Assistant</h3>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"></span> Verified Airline Agent
            </p>
          </div>
           <span className="rounded-full bg-muted px-2 py-1 font-mono text-[9px] font-bold text-muted-foreground">{dashboard.booking.bookingReference}</span>
        </div>

        <div
          className="grid shrink-0 grid-cols-4 gap-1 overflow-hidden border-b border-border/50 bg-background px-2 py-2"
          aria-label="Available conversation channels"
          data-testid="list-conversation-channels"
        >
          {channels.map((channel) => {
            const active = emailOpen ? channel === "Email" : activeChannel === channel;
            const simulated = channel === "WhatsApp" || channel === "RCS";
            const label = <>{channel}{simulated && <span className="block text-[7px] font-normal opacity-70">Simulated</span>}</>;
            return channel === "Email" ? (
              <button
                key={channel}
                type="button"
                onClick={() => setEmailOpen(true)}
                aria-pressed={active}
                className={`min-w-0 rounded-full border px-1 py-1 text-[9px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary bg-primary text-primary-foreground" : emailDelivered ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-border bg-background text-foreground"}`}
                data-testid="badge-channel-email"
                aria-label={emailDelivered ? "Email itinerary sent via Amazon SES" : "Email itinerary delivery"}
                title={emailDelivered ? "Itinerary sent via Amazon SES" : "Itinerary delivery only"}
              >
                Email{emailDelivered && <span className="block text-[7px] font-semibold">Sent</span>}
              </button>
            ) : (
              <button
                key={channel}
                type="button"
                aria-pressed={active}
                aria-label={`Use ${channel}${simulated ? " (simulated)" : ""} chat`}
                onClick={() => void handleSelectChannel(channel)}
                disabled={isTyping || selectConversationChannel.isPending}
                className={`min-w-0 rounded-full border px-1 py-1 text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
                data-testid={`badge-channel-${channel.toLowerCase()}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {channelError && <p role="alert" className="px-3 text-xs text-destructive">{channelError}</p>}

        {/* Chat Area */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 bg-muted/20 dark:bg-background relative" ref={scrollRef} data-testid="chat-scroll">
          <div className="space-y-5">
          {emailOpen ? <ItineraryEmail preview={emailPreview ?? dashboard.emailPreview} previouslyDelivered={emailDelivered} /> : <>
          <div className="flex justify-center mb-6 mt-2">
            <Badge variant="outline" className="bg-background/80 text-[9px] uppercase tracking-widest font-bold border-border/50 text-muted-foreground backdrop-blur-sm" data-testid="badge-chat-channel">
              {activeChannel} Thread
            </Badge>
          </div>

          {rebookSuccess && (
            <div className="mx-2 mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2" data-testid="banner-rebook-success">
              <div className="bg-emerald-500 p-1.5 rounded-full text-white shrink-0 mt-0.5">
                <Plane className="h-3 w-3" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Rebooking Confirmed</p>
                <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-medium">
                  {visibleBooking.bookingReference} is now booked on{" "}
                  {visibleBooking.currentFlight.flightNumber},{" "}
                  {visibleBooking.currentFlight.departure}–{visibleBooking.currentFlight.arrival}.
                </p>
              </div>
            </div>
          )}

          {noSuitableOptions && awaitingRequirement && (
            <div className="mx-2 rounded-2xl border border-accent/50 bg-accent/15 p-4" data-testid="status-no-suitable-options">
              <p className="text-xs font-bold text-foreground">No suitable options before {noSuitableOptions}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">No flight was selected and your booking is unchanged. Try a later arrival time below.</p>
            </div>
          )}

          {messages.map((msg, i) => {
            const isPassenger = msg.sender === 'passenger';
            return (
              <div key={msg.id || i} className={`flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none motion-reduce:duration-0 ${isPassenger ? 'items-end' : 'items-start'}`} data-testid={`message-${i}`}>
                <div className={`flex items-end gap-2 max-w-[85%] ${isPassenger ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isPassenger && (
                    <Avatar className="h-6 w-6 shrink-0 shadow-sm border border-primary/10">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-[9px] font-bold">AI</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap font-medium ${
                    isPassenger 
                      ? 'bg-secondary text-secondary-foreground rounded-br-sm' 
                      : 'bg-card text-card-foreground border border-border/50 rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
                <span className={`text-[9px] text-muted-foreground font-semibold mt-1 px-8 ${isPassenger ? 'text-right' : 'text-left'}`}>
                  {displayTime(msg.timestamp)}
                </span>
                {!isPassenger && activeChannel === "SMS" && (i === firstAiIndex || i === lastAiIndex) && (
                  <SmsDeliveryDetails receipt={smsDeliveries.find(receipt => receipt.kind === (i === firstAiIndex ? "notification" : rebookSuccess ? "confirmation" : ""))} />
                )}
              </div>
            );
          })}
          
          {isTyping && (
            <div className="flex items-start gap-2" data-testid="message-typing">
              <Avatar className="h-6 w-6 shrink-0 shadow-sm border border-primary/10">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-[9px] font-bold">AI</AvatarFallback>
              </Avatar>
              <div className="bg-card border border-border/50 px-3.5 py-3 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5 h-9">
                <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce motion-reduce:animate-none"></span>
                <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}
          {/* Quick Replies & Rich Actions */}
          <div className="flex flex-col gap-2 w-full">
            {awaitingRequirement && !rebookSuccess && (
              <div className="flex flex-wrap gap-2 pb-1 w-full">
                  {suggestedReplies.map((reply, index) => (
                    <Button key={reply.label} variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold rounded-full shrink-0 snap-center bg-card shadow-sm border-primary/20 text-primary hover:bg-primary/5 transition-transform active:scale-95" onClick={() => handleSend(reply.message)} data-testid={index === 0 && suggestedTime ? "btn-reply-suggested" : "btn-reply-2000"}>
                      {reply.label}
                    </Button>
                  ))}
              </div>
            )}

            {showingOptions && !awaitingConfirmationFor && !rebookSuccess && alternativeFlights.length > 0 && (
              <div className="flex flex-col gap-3 pb-2 w-full">
                {alternativeFlights.map(f => (
                  <div key={f.flightNumber} className="w-full min-w-0 bg-card border border-primary/10 rounded-[1.25rem] p-3 shadow-md flex flex-col gap-3" data-testid={`card-flight-option-${f.flightNumber}`}>
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-bold text-primary flex items-center gap-1.5">
                        <Plane className="h-3.5 w-3.5" />
                        {f.flightNumber}
                      </div>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 uppercase tracking-widest font-bold">
                        {f.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <div className="flex flex-col">
                        <span className="font-bold">{f.departure}</span>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{f.origin}</span>
                      </div>
                      <div className="w-10 h-px bg-border border-dashed border-t-2"></div>
                      <div className="flex flex-col text-right">
                        <span className="font-bold">{f.arrival}</span>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{f.destination}</span>
                      </div>
                    </div>
                    <Button size="sm" disabled={isTyping || selectConversationChannel.isPending} className="w-full h-8 text-[11px] font-bold mt-1 rounded-xl transition-transform active:scale-95 bg-primary/10 text-primary hover:bg-primary hover:text-white" onClick={() => handleSend(`Book me on ${f.flightNumber}`)} data-testid={`btn-select-flight-${f.flightNumber}`}>
                      Select Flight
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {awaitingConfirmationFor && !rebookSuccess && (
              <div className="flex flex-wrap gap-2 pb-1 w-full">
                <Button variant="default" size="sm" className="h-9 text-[11px] font-bold uppercase tracking-wide rounded-full flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-transform active:scale-95" onClick={() => handleSend("Yes, confirm")} data-testid="btn-confirm-rebook">
                  Yes, confirm
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-[11px] font-bold uppercase tracking-wide rounded-full flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 transition-transform active:scale-95" onClick={() => handleSend("No, show other options")} data-testid="btn-cancel-rebook">
                  No, cancel
                </Button>
              </div>
            )}
          </div>
          </>}
          </div>
        </div>

        {rebookSuccess && (emailPreview || emailDelivered) && !isTyping && (
          <p className="shrink-0 border-t border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-center text-[10px] text-emerald-800 dark:text-emerald-300" data-testid="demo-complete">
            Demo complete. Press Reset Demo to run it again.
          </p>
        )}

        {/* Input Area */}
        {!emailOpen && <div className="shrink-0 p-3 bg-background/95 backdrop-blur-md border-t border-border/50 pb-6 flex flex-col gap-3 z-40 relative">
          <div className="relative flex items-center">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSend();
                }
              }}
               placeholder={awaitingRequirement ? "What time do you need to arrive?" : "Message SurgeAir..."}
              className="pr-12 rounded-full bg-muted border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent h-11 text-[13px] font-medium placeholder:text-muted-foreground/60 shadow-sm"
               disabled={isTyping || selectConversationChannel.isPending}
              data-testid="input-chat"
            />
            <Button 
              size="icon" 
              className="absolute right-1.5 h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-transform active:scale-95"
              onClick={() => void handleSend()}
               disabled={!inputValue.trim() || isTyping || selectConversationChannel.isPending}
              data-testid="btn-send-message"
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </div>}

      </div>
      <p className="relative z-10 max-w-[380px] text-center text-[10px] leading-relaxed text-muted-foreground" data-testid="demo-channel-note">
        SMS uses AWS simulated numbers. WhatsApp and RCS are simulated. Email is sent via Amazon SES in sandbox mode.
      </p>
    </div>
  );
}