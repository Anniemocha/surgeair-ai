import { Router, type IRouter } from "express";
import {
  GetBookingParams,
  GetBookingResponse,
  GetDashboardResponse,
  GetFlightStatusParams,
  GetFlightStatusResponse,
  RebookFlightBody,
  RebookFlightResponse,
  SearchAlternativeFlightsQueryParams,
  SearchAlternativeFlightsResponse,
  SendItineraryBody,
  SendItineraryResponse,
} from "@workspace/api-zod";
import {
  SimulatedItinerarySender,
  surgeAirStore,
  type Channel,
} from "../surgeair/domain";

const router: IRouter = Router();
const itinerarySender = new SimulatedItinerarySender();

router.get("/dashboard", (_req, res) => {
  res.json(GetDashboardResponse.parse(surgeAirStore.getDashboard()));
});

router.get("/bookings/:bookingReference", (req, res) => {
  const { bookingReference } = GetBookingParams.parse(req.params);
  const booking = surgeAirStore.getBooking(bookingReference);

  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }

  res.json(GetBookingResponse.parse(booking));
});

router.get("/flights/alternatives", (req, res) => {
  const { origin, destination, arrivalBefore } =
    SearchAlternativeFlightsQueryParams.parse(req.query);
  const alternatives = surgeAirStore.searchAlternatives(
    origin,
    destination,
    arrivalBefore,
  );
  res.json(SearchAlternativeFlightsResponse.parse(alternatives));
});

router.get("/flights/:flightNumber/status", (req, res) => {
  const { flightNumber } = GetFlightStatusParams.parse(req.params);
  const flight = surgeAirStore.getFlight(flightNumber);

  if (!flight) {
    res.status(404).json({ error: "Flight not found." });
    return;
  }

  res.json(GetFlightStatusResponse.parse(flight));
});

router.post("/bookings/rebook", (req, res) => {
  const input = RebookFlightBody.parse(req.body);
  const result = surgeAirStore.rebook(
    input.bookingReference,
    input.newFlight,
    input.confirmation,
  );

  if (!("booking" in result)) {
    const error = result.error ?? "Unable to rebook flight.";
    res.status(error.includes("confirmation") ? 400 : 404).json({ error });
    return;
  }

  res.json(RebookFlightResponse.parse(result));
});

router.post("/itinerary/send", async (req, res) => {
  const input = SendItineraryBody.parse(req.body);
  const booking = surgeAirStore.getBooking(input.bookingReference);

  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }

  const channel = input.channel as Channel;
  const result = await itinerarySender.send(booking, channel);
  surgeAirStore.markItinerarySent(channel);
  res.json(SendItineraryResponse.parse(result));
});

export default router;