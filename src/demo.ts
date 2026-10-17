import type { Scene, VideoPlan } from "./types.js";

const blank = {
  broll_query: null,
  heading: null,
  subheading: null,
  stat_value: null,
  items: null,
  left: null,
  right: null,
  url: null,
  steps: null,
  specs: null,
  events: null,
  product: null,
} satisfies Omit<Scene, "id" | "narration" | "kind">;

/** A built-in sample video so the look, voice and animations can be checked without research. */
export const demoPlan: VideoPlan = {
  title: "AI Agents Explained: The Next Big Shift in Tech",
  alt_titles: ["What Is an AI Agent, Really?", "AI Agents: Hype or the Real Deal?", "Your Next App Might Be an AI Agent"],
  thumbnail_text: "AI AGENTS?!",
  description: "A sample video rendered by the studio to preview the visual style.",
  tags: ["AI", "AI agents", "tech explained"],
  scenes: [
    { ...blank, id: "hook", kind: "title", narration: "Your phone is about to stop waiting for you to tap things. It's going to start doing them for you.", broll_query: "person scrolling phone", heading: "Apps that act for you", subheading: "The rise of AI agents" },
    { ...blank, id: "what", kind: "broll", narration: "An AI agent is software that can plan, use tools, and finish a task on its own, not just answer a question.", broll_query: "person using laptop", heading: "What is an AI agent?" },
    {
      ...blank,
      id: "how",
      kind: "process",
      narration: "Here's how it works. You give it a goal, it breaks the goal into steps, it uses apps and websites to do them, and then it checks the result.",
      heading: "How an agent works",
      steps: [
        { icon: "🎯", label: "You set a goal" },
        { icon: "🧠", label: "It plans the steps" },
        { icon: "🛠️", label: "It uses your apps" },
        { icon: "✅", label: "It checks the result" },
      ],
    },
    {
      ...blank,
      id: "compare",
      kind: "compare",
      narration: "A chatbot tells you how to book a flight. An agent actually books it.",
      broll_query: "airport terminal",
      heading: "Chatbot vs agent",
      left: { label: "Chatbot", points: ["Answers questions", "You do the work"] },
      right: { label: "Agent", points: ["Takes actions", "Does the work for you"] },
    },
    {
      ...blank,
      id: "history",
      kind: "timeline",
      narration: "It happened fast. Chatbots went mainstream in 2022, started using tools in 2023, and by now agents can run whole tasks for you.",
      heading: "From chatbot to agent",
      events: [
        { date: "2022", label: "Chatbots go mainstream" },
        { date: "2023", label: "AI learns to use tools" },
        { date: "2025", label: "Agents run real tasks" },
        { date: "Today", label: "Agents in everyday apps" },
      ],
    },
    {
      ...blank,
      id: "specs",
      kind: "specs",
      narration: "So what should you look for? Which apps it can use, how much it can do on its own, and whether it asks before spending your money.",
      heading: "What to look for",
      specs: [
        { label: "Apps it can use", value: "Email, web, calendar" },
        { label: "Works on its own", value: "Minutes to hours" },
        { label: "Asks before paying", value: "Always should" },
      ],
    },
    { ...blank, id: "outro", kind: "title", narration: "So, are agents the next big thing? I think so. Subscribe, and I'll keep you ahead of it.", broll_query: "city night timelapse", heading: "The next big shift", subheading: "Subscribe for more" },
  ],
};
