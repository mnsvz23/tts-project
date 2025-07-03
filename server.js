require('dotenv').config();
const express = require('express');
const axios = require('axios');
const zlib = require('zlib');
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
          { role: 'system', content: 'You are a friendly assistant that writes short, simple, and fun stories for young children.' },
          { role: 'user', content: `Write a short kids story about: ${prompt}` }
        ],
        max_tokens: 300,
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
  try {
    // Use the provided custom voice
    const voiceId = 'qWdiyiWdNPlPyVCOLW0h';
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: story,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      },
      {
        headers: {
          'xi-api-key': elevenlabsKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'stream',
        decompress: false
      }
    );

    console.log('ElevenLabs response status:', response.status);
    console.log('ElevenLabs response headers:', response.headers);

    if (!response.headers['content-type'] || !response.headers['content-type'].includes('audio/mpeg')) {
      let data = '';
      response.data.on('data', chunk => data += chunk);
      response.data.on('end', () => {
        console.error('ElevenLabs returned non-audio:', data);
        res.status(500).json({ error: 'ElevenLabs did not return audio', details: data });
      });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    if (response.headers['content-encoding'] === 'gzip') {
      const gunzip = zlib.createGunzip();
      response.data.pipe(gunzip).pipe(res);
      gunzip.on('end', () => res.end());
    } else {
      response.data.pipe(res);
      response.data.on('end', () => res.end());
    }
  } catch (error) {
    console.error('ElevenLabs error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 