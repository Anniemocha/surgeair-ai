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
  ResetDemoResponse,
  SearchAlternativeFlightsQueryParams,
  SearchAlternativeFlightsResponse,
  SendItineraryBody,
  SendItineraryResponse,
  TestEmailIntegrationResponse,
  TestSmsIntegrationBody,
  TestSmsIntegrationResponse,
} from "@workspace/api-zod";
import {
  type BookingRecord,
  type FlightRecord,
  type SurgeAirStore,
} from "../surgeair/domain";
import { createAirlineTools } from "../surgeair/airline-tools";
import { AwsSmsSendError } from "../channels/aws-sms-provider";
import {
  AwsSesSendError,
  maskEmailAddress,
} from "../channels/aws-ses-provider";
import {
  isAuthorizedSmsTestRequest,
  SmsTestRateLimiter,
} from "../channels/sms-test-guard";
import { isSameOriginRequest } from "../surgeair/demo-session";

const router: IRouter = Router();
const smsTestRateLimiter = new SmsTestRateLimiter(
  Number(process.env.SMS_TEST_MIN_INTERVAL_MS ?? 30_000),
);
const emailTestRateLimiter = new SmsTestRateLimiter(
  Number(process.env.EMAIL_TEST_MIN_INTERVAL_MS ?? 30_000),
);
router.get("/dashboard", (_req, res) => {
  res.json(GetDashboardResponse.parse(_req.surgeAirStore.getDashboard()));
});

router.post("/demo/reset", (req, res): void => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Cross-site reset requests are not allowed." });
    return;
  }
  if (
    req.body !== undefined &&
    (typeof req.body !== "object" ||
      req.body === null ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length > 0)
  ) {
    res.status(400).json({ error: "Reset Demo does not accept a request body." });
    return;
  }
  res.json(ResetDemoResponse.parse(req.surgeAirStore.resetDemo()));
});

router.get("/bookings/:bookingReference", async (req, res) => {
  const { bookingReference } = GetBookingParams.parse(req.params);
  const booking = await createAirlineTools(req.surgeAirStore).execute<BookingRecord | null>(
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
  const alternatives = await createAirlineTools(req.surgeAirStore).execute<FlightRecord[]>(
    "searchAlternativeFlights",
    { origin, destination, arrivalBefore },
  );
  res.json(SearchAlternativeFlightsResponse.parse(alternatives));
});

router.get("/flights/:flightNumber/status", async (req, res) => {
  const { flightNumber } = GetFlightStatusParams.parse(req.params);
  const flight = await createAirlineTools(req.surgeAirStore).execute<FlightRecord | null>(
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
  const result = await createAirlineTools(req.surgeAirStore).execute<
    ReturnType<SurgeAirStore["rebook"]>
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
  const result = await createAirlineTools(req.surgeAirStore).execute<
    ReturnType<SurgeAirStore["prepareRebooking"]>
  >("prepareRebooking", input);
  if ("error" in result) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(PrepareRebookingResponse.parse(result));
});

router.post("/itinerary/send", async (req, res) => {
  const input = SendItineraryBody.parse(req.body);
  const result = await createAirlineTools(req.surgeAirStore).execute<
    {
      sent: boolean;
      channel: string;
      message: string;
      sentAt: string;
    } | { error: string } | null
  >("sendItinerary", input);
  if (!result) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(SendItineraryResponse.parse(result));
});

router.post("/integrations/email/test", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  if (req.surgeAirStore.getEmailProviderMode() !== "aws") {
    res.status(409).json({ error: "Amazon SES provider is not selected." });
    return;
  }
  if (!emailTestRateLimiter.tryAcquire()) {
    res.status(429).json({
      error: "Wait before sending another Amazon SES test email.",
    });
    return;
  }

  try {
    const result = await req.surgeAirStore.sendEmailIntegrationTest();
    res.json(
      TestEmailIntegrationResponse.parse({
        ...result,
        destination: maskEmailAddress(result.destination),
      }),
    );
  } catch (error) {
    if (error instanceof AwsSesSendError) {
      res.status(502).json({
        error:
          "Amazon SES send failed. Valid IAM credentials, a verified sender, and ses:SendEmail permission are required.",
      });
      return;
    }
    res.status(503).json({
      error:
        "Amazon SES configuration is incomplete. Configure the sender and fixed test destination.",
    });
  }
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
  if (req.surgeAirStore.getSmsProviderMode() !== "aws") {
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
    const result = await req.surgeAirStore.sendSmsSimulatorTest(input.data.message);
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