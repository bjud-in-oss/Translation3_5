export const MasterDevelopmentPlan = {
  project: "Gemini Live Translator App",
  architecture: {
    frontend: "React, Tailwind CSS. MediaRecorder API for audio capture (resampled to 16kHz PCM). Web Audio API for playback. LocalStorage to save selected microphone, speaker, and language preferences. React-QR-Code for easy group joining.",
    backend: "Express.js with WebSocket (ws) Broker architecture. Handles 'Control Messages' (Room state, AEC, Host commands) and 'Audio Binary' (16kHz PCM). Multiplexes target languages via isolated Gemini Live API connections.",
    audioPipeline: [
      "1. Audio Source (Host Injector or Participant) captures audio via MediaRecorder. Supports AEC (Acoustic Echo Cancellation) toggle.",
      "2. Client sends 16kHz PCM to Backend via WS. Backend routes based on active room mode (One-way broadcast vs Two-way open).",
      "3. Backend establishes ONE Gemini Live API WebSocket per target language.",
      "4. Backend distributes 24kHz PCM translated audio to listeners.",
      "5. Listeners apply local Acoustic Modes: Telephone (lowered volume, specific routing), Headset (standard), or Pro AV (Manual device selection, e.g., VAC/NDI tools)."
    ],
    failSafes: [
      "Feedback Loops: Implement 'Record & Approve' flow for safe translations in open rooms. Host can force-mute or control playback.",
      "AV Segregation: Host can decouple 'Audio Source' device from 'Controller' device.",
      "Rate Limits: Backend tracks Gemini API limits.",
      "10-Min Session Limit: Backend handles ContextWindowCompressionConfig and SessionResumption tokens."
    ]
  },
  designPhilosophy: "INDUSTRIAL CLARITY - Clean UI, no hidden states. Built for Pro-AV stability (support for virtual cables, NDI, Companion)."
};
