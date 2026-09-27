import assert from "node:assert/strict";
import { test } from "node:test";
import { describeAlternatives, distinctAlternatives } from "./alternatives.ts";

const first = { flightNumber: "SA218", departure: "11:30", arrival: "14:40" };
const second = { flightNumber: "SA226", departure: "13:10", arrival: "16:20" };

test("zero suitable flights stay empty", () => {
  assert.deepEqual(distinctAlternatives([]), []);
});

test("one actual flight is presented once and described as one suitable alternative", () => {
  const flights = distinctAlternatives([first]);
  assert.deepEqual(flights, [first]);
  const response = describeAlternatives(flights, "15:00");
  assert.match(response, /one suitable alternative/);
  assert.equal(response.match(/SA218/g)?.length, 1);
  assert.equal(response.includes("SA226"), false);
});

test("duplicate flight records are presented as one", () => {
  const flights = distinctAlternatives([first, { ...first }]);
  assert.deepEqual(flights, [first]);
  assert.equal(describeAlternatives(flights, "15:00").match(/SA218/g)?.length, 1);
});

test("different flights remain distinct", () => {
  const flights = distinctAlternatives([first, second, first]);
  assert.deepEqual(flights, [first, second]);
  const response = describeAlternatives(flights, "18:00");
  assert.match(response, /2 alternative flights/);
  assert.equal(response.match(/SA218/g)?.length, 1);
  assert.equal(response.match(/SA226/g)?.length, 1);
});