import assert from "node:assert/strict";
import { test } from "node:test";
import { uniqueSuggestedReplies } from "./suggested-replies.ts";

const arriveAtTwenty = { label: "Arrive before 20:00", message: "I need to arrive before 20:00" };

test("SA970's scenario prompt and the standard reply produce one button", () => {
  assert.deepEqual(uniqueSuggestedReplies([arriveAtTwenty, { ...arriveAtTwenty }]), [arriveAtTwenty]);
});

test("surrounding whitespace does not create a visually duplicate button", () => {
  assert.deepEqual(uniqueSuggestedReplies([
    { label: " Arrive before 20:00 ", message: " I need to arrive before 20:00 " },
    arriveAtTwenty,
  ]), [arriveAtTwenty]);
});

test("different replies remain in their original order", () => {
  const earlier = { label: "Arrive before 18:00", message: "I need to arrive before 18:00" };
  assert.deepEqual(uniqueSuggestedReplies([earlier, arriveAtTwenty, earlier]), [earlier, arriveAtTwenty]);
});

test("one, zero, and empty suggestions yield one, zero, and zero buttons", () => {
  assert.deepEqual(uniqueSuggestedReplies([arriveAtTwenty]), [arriveAtTwenty]);
  assert.deepEqual(uniqueSuggestedReplies([]), []);
  assert.deepEqual(uniqueSuggestedReplies([{ label: " ", message: "I need to arrive before 20:00" }]), []);
  assert.deepEqual(uniqueSuggestedReplies([{ label: "Arrive before 20:00", message: " " }]), []);
});