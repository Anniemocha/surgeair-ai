import type { ItineraryEmailPreview } from "@workspace/api-client-react";

export function ItineraryEmail({ preview, previouslyDelivered = false }: {
  preview?: ItineraryEmailPreview;
  previouslyDelivered?: boolean;
}) {
  if (!preview) return (
    <p className="rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground" data-testid="email-empty">
      {previouslyDelivered
        ? "An itinerary was sent in an earlier session, but its receipt is unavailable. No message ID has been reconstructed."
        : "No email sent yet. Complete a rebooking to see the itinerary email."}
    </p>
  );
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" data-testid="itinerary-email-preview">
      <header className="space-y-2 border-b border-border bg-muted/40 p-4 text-[11px]">
        <p className="font-semibold">Updated itinerary</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">From</dt><dd className="break-all" data-testid="email-from">{preview.from}</dd>
          <dt className="text-muted-foreground">To</dt><dd className="break-all" data-testid="email-to">{preview.to}</dd>
          <dt className="text-muted-foreground">Subject</dt><dd className="break-words font-medium" data-testid="email-subject">{preview.subject}</dd>
        </dl>
      </header>
      <div className="whitespace-pre-wrap break-words p-4 text-xs leading-relaxed" data-testid="email-body">{preview.body}</div>
      <footer className="break-all border-t border-border p-4 text-[10px] leading-relaxed text-muted-foreground" data-testid="email-receipt">
        {preview.provider === "amazon-ses"
          ? `Sent via Amazon SES (sandbox). Message ID: ${preview.messageId ?? "Not returned by provider"}`
          : "Email delivery was simulated; no Amazon SES Message ID was returned."}
      </footer>
    </article>
  );
}
