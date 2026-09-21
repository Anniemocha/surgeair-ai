import { useState, useRef, useEffect } from "react";
import { 
  Dashboard, 
  ConversationMessage, 
  Flight
} from "@workspace/api-client-react";
import { 
  useSearchAlternativeFlights,
  usePrepareRebooking,
  useRebookFlight, 
  useSendItinerary,
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
  MoreVertical,
  Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface SimulatorPanelProps {
  dashboard: Dashboard;
}

function displayTime(value: string) {
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value.slice(0, 5);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "HH:mm");
}

export function SimulatorPanel({ dashboard }: SimulatorPanelProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ConversationMessage[]>(dashboard.messages);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Conversation state machine
  const [isTyping, setIsTyping] = useState(false);
  const [awaitingRequirement, setAwaitingRequirement] = useState(true);
  const [showingOptions, setShowingOptions] = useState(false);
  const [alternativeFlights, setAlternativeFlights] = useState<Flight[]>([]);
  const [awaitingConfirmationFor, setAwaitingConfirmationFor] = useState<Flight | null>(null);
  const [rebookSuccess, setRebookSuccess] = useState(false);

  const [searchParams, setSearchParams] = useState({
    origin: dashboard.booking.origin,
    destination: dashboard.booking.destination,
    arrivalBefore: "18:00"
  });

  const searchFlights = useSearchAlternativeFlights(
    searchParams,
    { query: { enabled: false } as any }
  );

  const rebookFlight = useRebookFlight();
  const prepareRebooking = usePrepareRebooking();
  const sendItinerary = useSendItinerary();

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isTyping]);

  const addMessage = (text: string, sender: 'passenger' | 'ai') => {
    const newMessage: ConversationMessage = {
      id: Date.now().toString(),
      channel: 'SMS',
      sender,
      text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSend = async (textOverride?: string) => {
    const textToUse = textOverride || inputValue;
    if (!textToUse.trim()) return;
    
    const userText = textToUse.trim();
    if (!textOverride) setInputValue("");
    
    addMessage(userText, 'passenger');
    setIsTyping(true);

    // State machine logic
    if (awaitingRequirement) {
      // Look for a time pattern, or just mock it to 18:00
      const timeMatch = userText.match(/([0-2]?[0-9])[:h]?([0-5][0-9])/i);
      let arrivalBefore = "18:00"; // default mock
      if (timeMatch) {
        const hh = timeMatch[1].padStart(2, '0');
        const mm = timeMatch[2];
        arrivalBefore = `${hh}:${mm}`;
      }

      setSearchParams(prev => ({ ...prev, arrivalBefore }));

      setTimeout(async () => {
        try {
          const { data: flights } = await searchFlights.refetch();
          if (flights && flights.length > 0) {
            setAlternativeFlights(flights);
            const optionsText = flights.slice(0, 3).map((f, idx) => 
              `${idx + 1}. ${f.flightNumber} departing at ${f.departure} and arriving at ${f.arrival}`
            ).join('\n');
            addMessage(`I found alternative options arriving before ${arrivalBefore}. Options:\n\n${optionsText}\n\nWhich one would you prefer?`, 'ai');
            setAwaitingRequirement(false);
            setShowingOptions(true);
          } else {
            addMessage(`I couldn't find any flights arriving before ${arrivalBefore}. Could you provide another time?`, 'ai');
          }
        } catch (e) {
          addMessage("Sorry, I'm having trouble connecting to the reservation system right now.", 'ai');
        }
        setIsTyping(false);
      }, 1500);

    } else if (showingOptions) {
      setTimeout(async () => {
        // Try to match flight number from user input
        const selected = alternativeFlights.find(f => userText.toUpperCase().includes(f.flightNumber)) 
                       || alternativeFlights[0]; // fallback to first if not explicitly named

        try {
          await prepareRebooking.mutateAsync({
            data: {
              bookingReference: dashboard.booking.bookingReference,
              newFlight: selected.flightNumber
            }
          });
          setAwaitingConfirmationFor(selected);
          addMessage(`You've selected ${selected.flightNumber}. Shall I go ahead and confirm this rebooking for you? Reply YES or CONFIRM.`, 'ai');
          setShowingOptions(false);
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        } catch (e) {
          addMessage("Sorry, I couldn't prepare that flight for confirmation. Please choose another option.", 'ai');
        }
        setIsTyping(false);
      }, 1000);

    } else if (awaitingConfirmationFor) {
      if (userText.toLowerCase().includes('yes') || userText.toLowerCase().includes('confirm')) {
        try {
          // 1. Rebook
          await rebookFlight.mutateAsync({
            data: {
              bookingReference: dashboard.booking.bookingReference,
              newFlight: awaitingConfirmationFor.flightNumber,
              confirmation: true
            }
          });
          
          addMessage(`Great! I have confirmed your new flight ${awaitingConfirmationFor.flightNumber}.`, 'ai');
          
          // 2. Send Itinerary
          setTimeout(async () => {
            setIsTyping(true);
            await sendItinerary.mutateAsync({
              data: {
                bookingReference: dashboard.booking.bookingReference,
                channel: 'EMAIL'
              }
            });
            addMessage("I've also sent the updated itinerary to your email. Safe travels!", 'ai');
            setIsTyping(false);
            setRebookSuccess(true);
            
            // Invalidate dashboard to update the left panel
            queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetBookingQueryKey(dashboard.booking.bookingReference) });
          }, 1000);

        } catch (e) {
          addMessage("Sorry, there was an error processing your rebooking. Please try again.", 'ai');
        }
        setAwaitingConfirmationFor(null);
      } else {
        addMessage("Okay, I won't rebook you on that flight. Would you like to see other options?", 'ai');
        setAwaitingConfirmationFor(null);
        setAwaitingRequirement(true);
      }
      setIsTyping(false);
    } else {
      setTimeout(() => {
        addMessage("I'm here to help. Is there anything else you need?", 'ai');
        setIsTyping(false);
      }, 1000);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 lg:p-8 bg-slate-900 overflow-hidden">
      
      {/* Device Mockup */}
      <div className="w-full max-w-[400px] h-full max-h-[850px] min-h-[550px] bg-background rounded-[3rem] shadow-2xl border-[14px] border-slate-800 relative flex flex-col overflow-hidden ring-4 ring-black/5">
        
        {/* Dynamic Island / Notch area */}
        <div className="absolute top-0 inset-x-0 h-7 flex justify-center z-50">
          <div className="w-1/3 h-full bg-slate-800 rounded-b-2xl"></div>
        </div>

        {/* Status Bar */}
        <div className="h-12 bg-background/95 backdrop-blur-md flex items-center justify-between px-6 pt-2 text-[11px] font-medium z-40">
          <span>{format(new Date(), "HH:mm")}</span>
          <div className="flex items-center gap-1.5">
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <Battery className="h-4 w-4" />
          </div>
        </div>

        {/* Chat Header */}
        <div className="px-4 pb-3 pt-2 bg-background/95 backdrop-blur-md border-b flex items-center gap-3 z-40 shadow-sm">
          <div className="bg-primary/10 p-2 rounded-full text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">SurgeAir Assistant</h3>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Online
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <Phone className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#E5DDD5]/20 dark:bg-background" ref={scrollRef}>
          <div className="flex justify-center mb-6">
            <Badge variant="outline" className="bg-background/50 text-[10px] font-normal">
              Today • SMS Thread
            </Badge>
          </div>

          {messages.map((msg, i) => {
            const isPassenger = msg.sender === 'passenger';
            return (
              <div key={msg.id || i} className={`flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 ${isPassenger ? 'items-end' : 'items-start'}`}>
                <div className="flex items-end gap-2 max-w-[85%]">
                  {!isPassenger && (
                    <Avatar className="h-6 w-6 shrink-0 border border-border">
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">SA</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`p-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${
                    isPassenger 
                      ? 'bg-secondary text-secondary-foreground rounded-br-sm' 
                      : 'bg-card text-card-foreground border rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
                <span className={`text-[10px] text-muted-foreground mt-1 px-8 ${isPassenger ? 'text-right' : 'text-left'}`}>
                  {displayTime(msg.timestamp)}
                </span>
              </div>
            );
          })}
          
          {isTyping && (
            <div className="flex items-start gap-2">
              <Avatar className="h-6 w-6 shrink-0 border border-border">
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">SA</AvatarFallback>
              </Avatar>
              <div className="bg-card border p-3 rounded-2xl rounded-bl-sm shadow-sm flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 bg-background border-t pb-8 flex flex-col gap-3">
          {/* Quick Replies */}
          {awaitingRequirement && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 px-1">
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-full shrink-0" onClick={() => handleSend("I need to arrive before 18:00")}>
                Arrive before 18:00
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-full shrink-0" onClick={() => handleSend("Get me there by 20:00")}>
                Arrive before 20:00
              </Button>
            </div>
          )}
          {showingOptions && alternativeFlights.length > 0 && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 px-1">
              {alternativeFlights.map(f => (
                <Button key={f.flightNumber} variant="outline" size="sm" className="h-7 text-xs rounded-full shrink-0" onClick={() => handleSend(`Book me on ${f.flightNumber}`)}>
                  Select {f.flightNumber}
                </Button>
              ))}
            </div>
          )}
          {awaitingConfirmationFor && (
            <div className="flex gap-2 pb-1 px-1">
              <Button variant="default" size="sm" className="h-7 text-xs rounded-full flex-1" onClick={() => handleSend("Yes, confirm")}>
                Yes, confirm
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-full flex-1" onClick={() => handleSend("No, show other options")}>
                No, cancel
              </Button>
            </div>
          )}

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
              placeholder={awaitingRequirement ? "Type 'I need to arrive before 18:00'..." : "Type a message..."}
              className="pr-12 rounded-full bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-secondary focus-visible:border-transparent h-10 text-sm"
              disabled={isTyping}
            />
            <Button 
              size="icon" 
              className="absolute right-1 h-8 w-8 rounded-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || isTyping}
            >
              <Send className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}