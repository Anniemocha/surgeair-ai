export type SuggestedReply = { label: string; message: string };

export function uniqueSuggestedReplies(replies: readonly SuggestedReply[]): SuggestedReply[] {
  const seen = new Set<string>();
  return replies.flatMap(({ label, message }) => {
    const trimmedLabel = label.trim();
    const trimmedMessage = message.trim();
    if (!trimmedLabel || !trimmedMessage || seen.has(trimmedLabel)) return [];
    seen.add(trimmedLabel);
    return [{ label: trimmedLabel, message: trimmedMessage }];
  });
}