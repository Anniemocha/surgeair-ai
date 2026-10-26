/** Delivery activity is separate from the active conversation channel and integration readiness. */
export function wasItineraryEmailDelivered(activities: readonly { label: string }[]): boolean {
  return activities.some((activity) => activity.label === "Email sent via Amazon SES" || activity.label === "Email delivered via Amazon SES");
}