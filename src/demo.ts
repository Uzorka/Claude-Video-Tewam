import type { VideoPlan } from "./types.js";

/** A built-in sample video so the look and feel can be checked without any API keys. */
export const demoPlan: VideoPlan = {
  title: "AI Agents Explained: The Next Big Shift in Tech",
  alt_titles: ["What Is an AI Agent, Really?", "AI Agents: Hype or the Real Deal?", "Your Next App Might Be an AI Agent"],
  thumbnail_text: "AI AGENTS?!",
  description: "A sample video rendered by the Uzorka media studio to preview the visual style.",
  tags: ["AI", "AI agents", "tech explained"],
  scenes: [
    { id: "hook", narration: "Your phone is about to stop waiting for you to tap things. It's going to start doing them for you.", kind: "title", broll_query: "smartphone close up", heading: "Apps that act for you", subheading: "The rise of AI agents", stat_value: null, items: null, left: null, right: null, url: null, product: null },
    { id: "what", narration: "An AI agent is software that can plan, use tools, and finish a task on its own, not just answer a question.", kind: "broll", broll_query: "person using laptop", heading: "What is an AI agent?", subheading: null, stat_value: null, items: null, left: null, right: null, url: null, product: null },
    { id: "three", narration: "Think of it in three steps. It understands the goal, it breaks it into steps, and it takes action.", kind: "list", broll_query: "circuit board macro", heading: "How agents work", subheading: null, stat_value: null, items: ["Understand the goal", "Plan the steps", "Take action"], left: null, right: null, url: null, product: null },
    { id: "compare", narration: "A chatbot tells you how to book a flight. An agent actually books it.", kind: "compare", broll_query: "airport", heading: "Chatbot vs agent", subheading: null, stat_value: null, items: null, left: { label: "Chatbot", points: ["Answers questions", "You do the work"] }, right: { label: "Agent", points: ["Takes actions", "Does the work for you"] }, url: null, product: null },
    { id: "stat", narration: "And the speed matters. Tasks that took an afternoon can take minutes.", kind: "stat", broll_query: "clock time lapse", heading: "Faster work", subheading: "afternoon tasks, done in minutes", stat_value: "10x", items: null, left: null, right: null, url: null, product: null },
    { id: "quote", narration: "The catch? You still need to check its work. Trust, but verify.", kind: "quote", broll_query: "person thinking", heading: "Trust, but verify.", subheading: "The golden rule of AI agents", stat_value: null, items: null, left: null, right: null, url: null, product: null },
    { id: "outro", narration: "So, are agents the next big thing? I think so. Subscribe, and I'll keep you ahead of it.", kind: "title", broll_query: "city night timelapse", heading: "The next big shift", subheading: "Subscribe for more", stat_value: null, items: null, left: null, right: null, url: null, product: null },
  ],
};
