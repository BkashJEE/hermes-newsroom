export async function askHermes(task: string, question: string, storyIds?: string[]) {
  const response = await fetch("/api/newsroom/hermes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Newsroom-Client": "1" },
    body: JSON.stringify({ task, question, storyIds }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Hermes request failed.");
  return result as { text: string; generatedAt: string; composedBy: string; feedMode: string };
}
