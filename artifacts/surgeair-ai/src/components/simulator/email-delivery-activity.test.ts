import assert from "node:assert/strict";
import { test } from "node:test";
import { wasItineraryEmailDelivered } from "./email-delivery-activity.ts";

test("successful SES itinerary delivery activates the Email activity indicator", () => {
  assert.equal(wasItineraryEmailDelivered([{ label: "Email delivered via Amazon SES" }]), true);
});

test("pending, failed, and non-Email deliveries do not indicate successful SES delivery", () => {
  assert.equal(wasItineraryEmailDelivered([]), false);
  assert.equal(wasItineraryEmailDelivered([{ label: "Email delivery failed" }]), false);
  assert.equal(wasItineraryEmailDelivered([{ label: "Email delivery simulated" }]), false);
  assert.equal(wasItineraryEmailDelivered([{ label: "Updated itinerary generated" }]), false);
});