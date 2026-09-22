---
id: twilio-voice-brain
name: Twilio Voice Brain
version: 1.0.0
description: Voice-enabled brain using Twilio Voice + OpenAI for speech-to-text and text-to-speech
category: sense
requires: []
secrets:
  - name: TWILIO_ACCOUNT_SID
    description: Twilio Account SID
    where: https://console.twilio.com/
  - name: TWILIO_AUTH_TOKEN
    description: Twilio Auth Token
    where: https://console.twilio.com/
  - name: OPENAI_API_KEY
    description: OpenAI API key for Whisper + TTS
    where: https://platform.openai.com/api-keys
health_checks:
  - type: env_exists
    var: TWILIO_ACCOUNT_SID
  - type: env_exists
    var: TWILIO_AUTH_TOKEN
  - type: env_exists
    var: OPENAI_API_KEY
setup_time: 15 min
---

# Twilio Voice Brain Setup

## Prerequisites

- A Twilio account with a purchased phone number
- An OpenAI API key with Whisper + TTS access
- A publicly reachable webhook URL (ngrok or production endpoint)

## Step 1: Configure Environment

Set the following environment variables:

```bash
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_AUTH_TOKEN=your_auth_token_here
export OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Step 2: Wire the Voice Webhook

Point your Twilio phone number's voice webhook to:

```
POST https://your-domain.com/api/voice/incoming
```

The brain will:

1. Transcribe incoming speech via OpenAI Whisper
2. Process the transcript through the brain query pipeline
3. Synthesize a response via OpenAI TTS
4. Return the audio as a TwiML response

---

## Step 3: Test the Integration

Call your Twilio number and speak a query. The brain should respond with a synthesized voice answer within 3-5 seconds.
