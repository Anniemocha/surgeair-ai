import { Router, type IRouter } from "express";
import {
  GetBookingParams,
  GetBookingResponse,
  GetDashboardResponse,
  GetFlightStatusParams,
  GetFlightStatusResponse,
  PrepareRebookingBody,
  PrepareRebookingResponse,
  RebookFlightBody,
  RebookFlightResponse,
  SearchAlternativeFlightsQueryParams,
  SearchAlternativeFlightsResponse,
  SendItineraryBody,
  SendItineraryResponse,
  TestSmsIntegrationBody,
  TestSmsIntegrationResponse,
} from "@workspace/api-zod";
import {
  surgeAirStore,
  type BookingRecord,
  type FlightRecord,
} from "../surgeair/domain";
import { airlineTools } from "../surgeair/airline-tools";
import { AwsSmsSendError } from "../channels/aws-sms-provider";
import {
  isAuthorizedSmsTestRequest,
  SmsTestRateLimiter,
} from "../channels/sms-test-guard";

const router: IRouter = Router();
const smsTestRateLimiter = new SmsTestRateLimiter(
  Number(process.env.SMS_TEST_MIN_INTERVAL_MS ?? 30_000),
);
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

router.post("/bookings/rebook/prepare", async (req, res) => {
  const input = PrepareRebookingBody.parse(req.body);
  const result = await airlineTools.execute<
    ReturnType<typeof surgeAirStore.prepareRebooking>
  >("prepareRebooking", input);
  if ("error" in result) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(PrepareRebookingResponse.parse(result));
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

router.post("/integrations/sms/test", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const input = TestSmsIntegrationBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "A message between 1 and 1600 characters is required." });
    return;
  }
  if (surgeAirStore.getSmsProviderMode() !== "aws") {
    res.status(409).json({ error: "AWS SMS provider is not selected." });
    return;
  }
  const configuredToken = process.env.SMS_TEST_TOKEN;
  if (!configuredToken?.trim()) {
    res.status(503).json({
      error: "SMS test authorization is not configured.",
    });
    return;
  }
  if (
    !isAuthorizedSmsTestRequest(
      req.get("x-sms-test-token"),
      configuredToken,
    )
  ) {
    res.status(403).json({ error: "SMS test authorization failed." });
    return;
  }
  if (!smsTestRateLimiter.tryAcquire()) {
    res.status(429).json({
      error: "Wait before sending another SMS test message.",
    });
    return;
  }

  try {
    const result = await surgeAirStore.sendSmsSimulatorTest(input.data.message);
    res.json(
      TestSmsIntegrationResponse.parse({
        success: true,
        ...result,
      }),
    );
  } catch (error) {
    if (error instanceof AwsSmsSendError) {
      res.status(502).json({
        error:
          "AWS SMS send failed. Valid IAM credentials and End User Messaging SMS permissions are required.",
      });
      return;
    }
    res.status(503).json({
      error:
        "AWS SMS configuration is incomplete. Configure the simulator destination and origination identity.",
    });
  }
});

export default router;