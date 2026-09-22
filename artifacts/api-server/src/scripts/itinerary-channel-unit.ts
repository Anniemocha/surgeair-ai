import assert from "node:assert/strict";
import {
  createAirlineTools,
  UnsupportedItineraryChannelError,
} from "../surgeair/airline-tools";
import type { Channel, SurgeAirStore } from "../surgeair/domain";

const calls: Channel[] = [];
const store = {
  async sendItinerary(_bookingReference: string, channel: Channel) {
    calls.push(channel);
    return {
      delivery: channel === "Email" ? "email-provider" : "simulated",
      channel,
    };
  },
} as unknown as SurgeAirStore;
const tools = createAirlineTools(store);

for (const requestedChannel of ["EMAIL", "Email"]) {
  const result = await tools.execute<{
    delivery: "email-provider" | "simulated";
    channel: Channel;
  }>("sendItinerary", {
    bookingReference: "SG4821",
    channel: requestedChannel,
  });
  assert.equal(result.channel, "Email");
  assert.equal(result.delivery, "email-provider");
}

for (const requestedChannel of ["WhatsApp", "RCS"]) {
  const result = await tools.execute<{
    delivery: "email-provider" | "simulated";
    channel: Channel;
  }>("sendItinerary", {
    bookingReference: "SG4821",
    channel: requestedChannel,
  });
  assert.equal(result.channel, requestedChannel);
  assert.equal(result.delivery, "simulated");
}

const callsBeforeInvalidInput = calls.length;
await assert.rejects(
  () =>
    tools.execute("sendItinerary", {
      bookingReference: "SG4821",
      channel: "FAX",
    }),
  UnsupportedItineraryChannelError,
);
assert.equal(calls.length, callsBeforeInvalidInput);

process.stdout.write("Itinerary channel normalization checks passed.\n");