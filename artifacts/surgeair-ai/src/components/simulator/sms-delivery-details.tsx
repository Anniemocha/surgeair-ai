import type { SmsDeliveryReceipt } from "@workspace/api-client-react";

export function SmsDeliveryDetails({ receipt }: { receipt?: SmsDeliveryReceipt }) {
  return (
    <details className="mt-1 max-w-full px-8 text-[9px] leading-relaxed text-muted-foreground" data-testid={`sms-delivery-detail${receipt ? `-${receipt.kind}` : ""}`}>
      <summary className="cursor-pointer">SMS simulator delivery details</summary>
      {receipt && <p>{receipt.kind === "notification" ? "Disruption notification SMS" : "Booking confirmation SMS"}</p>}
      {receipt?.status === "sent" ? <>
        <p>Sent via AWS End User Messaging SMS simulator (API accepted; not physical carrier delivery).</p>
        <p className="break-all">Message ID: {receipt.messageId ?? "Not returned by AWS"}</p>
        <p>{receipt.timestamp}</p>
      </> : receipt?.status === "failed" ? <p>SMS simulator call failed</p>
        : receipt?.status === "skipped" ? <p>SMS skipped: demo limit. AWS was not called.</p>
        : receipt?.status === "simulated" ? <p>SMS delivery simulated; AWS was not called.</p>
        : <p>No SMS was sent for this chat bubble. Only the disruption notification and booking confirmation trigger AWS simulator calls.</p>}
    </details>
  );
}
