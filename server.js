const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const PlayHT = require('playht');
const cors = require('cors');

// Initialize PlayHT
PlayHT.init({
  apiKey: process.env.API_KEY,
  userId: process.env.USER_ID,
});

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();
const port = 3001;
app.use(cors());

// Upload and process audio route
app.post('/upload', upload.single('audioFile'), async (req, res) => {
  const { text, name = 'cloned-voice', gender = 'male' } = req.body;

  if (!req.file || !text) {
    return res.status(400).json({ message: 'Audio file and text are required.' });
  }

  try {
    // Upload the audio file to Supabase
    console.log('Uploading original audio file to Supabase...');
    const { file } = req;
    const contentType = file.mimetype || 'audio/mpeg';
    console.log(file);
    const uploadPath = `audio/${Date.now()}_${file.originalname}`;
    const { data: uploadedFile, error: uploadError } = await supabase.storage
      .from('audio-bucket') //bucket name
      .upload(uploadPath, file.buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: contentType,
      });

    if (uploadError) {
      throw new Error(`Supabase upload error: ${uploadError.message}`);
    }

    const originalAudioUrl = supabase.storage.from('audio-bucket').getPublicUrl(uploadedFile.path).data.publicUrl;
    console.log('Original audio uploaded:', originalAudioUrl);

    // Clone the voice using PlayHT
    console.log('Cloning the voice...');

    // since i run out of my trial counts, i am unable to clone any voices again. So, i made use of already cloned voice for further generation of audio file from the text given.
    // i used playHT for cloning and generating the voice. They provide limited functionality for the free-tier. But the actual code that i used to clone the voice is below!

    // const clonedVoice = await PlayHT.clone(name, originalAudioUrl, gender);
    // console.log('Cloned voice info:', clonedVoice);

    // Generate audio for the provided text
    console.log('Generating audio with cloned voice...');
    
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempAudioPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
    const fileStream = fs.createWriteStream(tempAudioPath);

    const audioStream = await PlayHT.stream(text, {
      voiceEngine: 'PlayHT2.0',
      voiceId: 's3://voice-cloning-zero-shot/c1942f6e-db5a-44e4-8b46-4ddb0d89069f/cloned-voice/manifest.json',//already cloned voice id. 
    });

    audioStream.pipe(fileStream);
    await new Promise((resolve) => fileStream.on('finish', resolve));
    console.log('Audio generated locally at:', tempAudioPath);

    // Upload the generated audio file to Supabase
    console.log('Uploading generated audio file to Supabase...');
    const generatedUploadPath = `cloned-audio/${Date.now()}_${path.basename(tempAudioPath)}`;
    const { data: generatedFile, error: generatedUploadError } = await supabase.storage
      .from('audio-bucket') 
      .upload(generatedUploadPath, fs.readFileSync(tempAudioPath), {
        contentType: 'audio/mpeg',
      });

    if (generatedUploadError) {
      throw new Error(`Supabase generated audio upload error: ${generatedUploadError.message}`);
    }

    const generatedAudioUrl = supabase.storage.from('audio-bucket').getPublicUrl(generatedFile.path).data.publicUrl;
    console.log('Generated audio file URL:', generatedAudioUrl);

    // Remove the temporary file
    fs.unlinkSync(tempAudioPath);

    res.status(200).json({
      message: 'Audio processed successfully.',
      originalAudioUrl,
      generatedAudioUrl,
    });
  } catch (error) {
    console.error('Error processing the request:', error.message);
    res.status(500).json({ message: 'Error processing the request.', error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
