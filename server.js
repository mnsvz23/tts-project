require('dotenv').config();
const express = require('express');
const axios = require('axios');
const zlib = require('zlib');
const WebSocket = require('ws');
const { PassThrough } = require('stream');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

app.post('/story', async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.status(500).json({ error: 'OpenAI API key not set' });
  }
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that writes short stories for children.\nThe story should:\n- Be no more than 700 words.\n- Read like a kids story book.\n- Use very simple words that a child can understand.\n- Be fun, engaging, and age-appropriate.\n- Avoid scary or inappropriate content.\nRespond only with the story text.`
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const story = response.data.choices[0].message.content.trim();
    res.json({ story });
  } catch (error) {
    console.error('OpenAI error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate story' });
  }
});

app.post('/audio', async (req, res) => {
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenlabsKey) {
    return res.status(500).json({ error: 'ElevenLabs API key not set' });
  }
  const { story } = req.body;
  if (!story) {
    return res.status(400).json({ error: 'Story is required' });
  }

  // Only support full file requests for now
  if (req.headers.range) {
    return res.status(501).json({ error: 'Range requests not supported yet' });
  }

  try {
    // Use the v3 WebSocket streaming endpoint
    const voiceId = 'qWdiyiWdNPlPyVCOLW0h';
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input`;
    const ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': elevenlabsKey
      }
    });

    let audioStream = new PassThrough();
    let audioBuffers = [];
    let isAudioStarted = false;

    ws.on('open', () => {
      // Send initial connection message
      ws.send(JSON.stringify({
        text: story,
        voice_settings: {
          speed: 1,
          stability: 0.5,
          similarity_boost: 0.5
        },
        model_id: 'eleven_monolingual_v1',
        xi_api_key: elevenlabsKey
      }));
      // Trigger generation
      ws.send(JSON.stringify({ text: story, try_trigger_generation: true }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.audio) {
          // Audio is base64 encoded
          const audioChunk = Buffer.from(msg.audio, 'base64');
          audioBuffers.push(audioChunk);
          if (!isAudioStarted) {
            res.setHeader('Content-Type', 'audio/mpeg');
            isAudioStarted = true;
          }
          audioStream.write(audioChunk);
        }
        if (msg.isFinal) {
          audioStream.end();
          ws.close();
        }
      } catch (e) {
        // Not JSON, ignore
      }
    });

    ws.on('close', () => {
      audioStream.end();
    });

    ws.on('error', (err) => {
      console.error('ElevenLabs WebSocket error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate audio (WebSocket error)' });
      }
      audioStream.end();
    });

    // Pipe the audio stream to the response
    audioStream.pipe(res);
    audioStream.on('end', () => res.end());
  } catch (error) {
    console.error('ElevenLabs error:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 