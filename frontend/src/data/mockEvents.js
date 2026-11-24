// Mock recognition events used for demonstration.
// Each entry is played in order while recognition is running.
// type: 'speech' (teacher / speaker voice) or 'gesture' (sign language).

export const MOCK_EVENTS = [
  { type: 'speech', speaker: 'Teacher', text: 'Good morning, everyone. Please open your notebooks to chapter four.' },
  { type: 'gesture', speaker: 'Student 1', text: 'Good morning', gesture: 'GOOD + MORNING' },
  { type: 'speech', speaker: 'Teacher', text: "Today we are going to learn about the water cycle and how rain is formed." },
  { type: 'gesture', speaker: 'Student 1', text: 'Question', gesture: 'QUESTION' },
  { type: 'speech', speaker: 'Teacher', text: 'Yes, go ahead. What is your question?' },
  { type: 'gesture', speaker: 'Student 1', text: 'Where does the water go?', gesture: 'WHERE + WATER + GO' },
  { type: 'speech', speaker: 'Teacher', text: 'Great question. The sun heats the water, and it rises into the air as vapour. This is called evaporation.' },
  { type: 'speech', speaker: 'Teacher', text: 'When the vapour cools down high in the sky, it forms clouds. We call that condensation.' },
  { type: 'gesture', speaker: 'Student 2', text: 'I understand', gesture: 'I + UNDERSTAND' },
  { type: 'speech', speaker: 'Teacher', text: 'Excellent. Finally, the water falls back to the ground as rain. That is precipitation.' },
  { type: 'gesture', speaker: 'Student 1', text: 'Thank you', gesture: 'THANK-YOU' },
  { type: 'speech', speaker: 'Teacher', text: 'You are welcome. Please draw the water cycle diagram on page fifty-two.' },
  { type: 'gesture', speaker: 'Student 2', text: 'Please repeat', gesture: 'PLEASE + REPEAT' },
  { type: 'speech', speaker: 'Teacher', text: 'Sure. Draw the diagram on page fifty-two and label all three stages.' },
  { type: 'gesture', speaker: 'Student 2', text: 'Yes', gesture: 'YES' },
  { type: 'speech', speaker: 'Teacher', text: 'We will review your diagrams together in ten minutes.' },
];

// Delay range (ms) between mock events.
export const MOCK_DELAY = { min: 2200, max: 4200 };
