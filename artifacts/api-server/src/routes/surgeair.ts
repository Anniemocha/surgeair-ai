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
  surgeAirStore,
  type BookingRecord,
  type FlightRecord,
} from "../surgeair/domain";
import { airlineTools } from "../surgeair/airline-tools";

const router: IRouter = Router();
router.get("/dashboard", (_req, res) => {
  res.json(GetDashboardResponse.parse(surgeAirStore.getDashboard()));
});

router.get("/bookings/:bookingReference", async (req, res) => {
  const { bookingReference } = GetBookingParams.parse(req.params);
  const booking = await airlineTools.execute<BookingRecord | null>(
    "getBooking",
    { bookingReference },
  );

  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }

  res.json(GetBookingResponse.parse(booking));
});

router.get("/flights/alternatives", async (req, res) => {
  const { origin, destination, arrivalBefore } =
    SearchAlternativeFlightsQueryParams.parse(req.query);
  const alternatives = await airlineTools.execute<FlightRecord[]>(
    "searchAlternativeFlights",
    { origin, destination, arrivalBefore },
  );
  res.json(SearchAlternativeFlightsResponse.parse(alternatives));
});

router.get("/flights/:flightNumber/status", async (req, res) => {
  const { flightNumber } = GetFlightStatusParams.parse(req.params);
  const flight = await airlineTools.execute<FlightRecord | null>(
    "getFlightStatus",
    { flightNumber },
  );

  if (!flight) {
    res.status(404).json({ error: "Flight not found." });
    return;
  }

  res.json(GetFlightStatusResponse.parse(flight));
});

router.post("/bookings/rebook", async (req, res) => {
  const input = RebookFlightBody.parse(req.body);
  const result = await airlineTools.execute<
    ReturnType<typeof surgeAirStore.rebook>
  >("rebookFlight", input);

  if (!("booking" in result)) {
    const error = result.error ?? "Unable to rebook flight.";
    res.status(error.includes("confirmation") ? 400 : 404).json({ error });
    return;
  }

  res.json(RebookFlightResponse.parse(result));
});

router.post("/itinerary/send", async (req, res) => {
  const input = SendItineraryBody.parse(req.body);
  const result = await airlineTools.execute<
    {
      sent: boolean;
      channel: string;
      message: string;
      sentAt: string;
    } | null
  >("sendItinerary", input);
  if (!result) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  res.json(SendItineraryResponse.parse(result));
});

export default router;