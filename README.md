# Voice Transcription App - Beginner Friendly

A simple Ruby on Rails application that lets you record your voice and get transcriptions and summaries. This app has been simplified to make it easy for beginners to understand and modify.

## 📋 What This App Does

1. **Record Voice**: Click a button to start recording your voice
2. **Get Transcription**: The app converts your speech to text using AI
3. **Get Summary**: The app creates a short summary of what you said
4. **Save Everything**: You can see all your past recordings and summaries

## 🏗️ How It Works (Simple Version)

### Frontend (JavaScript)
- **transcription_controller.js**: Simple JavaScript that handles the record button and shows results
- **application.js**: Basic setup for the website

### Backend (Ruby)
- **TranscriptionsController**: Handles web requests (like "start recording", "upload audio")
- **SpeechToTextService**: Sends audio to AssemblyAI and gets text back
- **SummarizationService**: Creates summaries from the text
- **ProcessAudioJob**: Background job that processes audio files
- **GenerateSummaryJob**: Background job that creates summaries

### Database
- **Transcription model**: Stores the text, summary, and status of each recording

## � Setup Instructions

### 1. Install Required Software
```bash
# On Mac with Homebrew
brew install ruby
brew install postgresql
brew install redis

# On Ubuntu/Debian
sudo apt-get install ruby-full postgresql redis-server
```

### 2. Get the Code
```bash
git clone <your-repo-url>
cd voice_assist_ruby
```

### 3. Install Dependencies
```bash
bundle install    # Install Ruby gems
## 📁 Project Structure (Simplified)

```
app/
├── controllers/
│   └── transcriptions_controller.rb    # Handles web requests
├── models/
│   └── transcription.rb               # Database model
├── services/
│   ├── speech_to_text_service.rb      # Converts audio to text
│   └── summarization_service.rb       # Creates summaries
├── jobs/
│   ├── process_audio_job.rb           # Background audio processing
│   └── generate_summary_job.rb        # Background summary creation
├── channels/
│   └── transcription_channel.rb       # Real-time updates
└── javascript/
    └── controllers/
        └── transcription_controller.js # Frontend recording logic
```

## 🎯 Learning Path for Beginners

### Start Here:
1. **transcription_controller.js** - See how the record button works
2. **transcriptions_controller.rb** - See how the server handles requests
3. **speech_to_text_service.rb** - See how audio becomes text

### Then Explore:
1. **process_audio_job.rb** - Background processing
2. **transcription.rb** - Database model
3. **summarization_service.rb** - AI summaries

## 🔧 Key Features Made Simple

### Recording Audio
- Click "Start" → Browser asks for microphone permission
- Speak → Audio is recorded in chunks
- Click "Stop" → Audio is sent to server

### Processing Audio
- Server receives audio file
- Sends audio to AssemblyAI (speech-to-text service)
- Gets back the text version of your speech
- Saves text to database

### Creating Summary
- Takes the text from your speech
- Sends it to AI service (or creates simple summary)
- Saves summary to database
- Shows summary on screen

### Real-time Updates
- Uses ActionCable (Rails WebSockets)
- Server can send updates to browser instantly
- You see progress as it happens

## � Common Issues & Solutions

**Error: Can't record audio**
- Make sure you're using Chrome or Firefox
- Allow microphone access when prompted
- Check if another app is using your microphone

**Error: No transcription appears**
- Check if Redis is running: `redis-server`
- Look at the Rails logs: `tail -f log/development.log`

**Error: Database errors**
- Run: `rails db:reset` to reset the database

## 📚 Next Steps for Learning

1. **Add new features**: Try adding a "delete recording" button
2. **Modify the UI**: Change the colors or layout
3. **Add validations**: Make sure users can't upload huge files
4. **Add tests**: Write simple tests for your code

## 🆘 Getting Help

- Look at the Rails logs: `tail -f log/development.log`
- Check the browser console (F12) for JavaScript errors
- Make sure all services are running (Rails, Redis)

This simplified version removes complex streaming and focuses on basic record → transcribe → summarize workflow that's easier to understand and modify!

**Issue**: Summary not generated
- **Solution**: Ensure transcription completed, check LLM API credits

## 🎯 Roadmap

Future enhancements:
- [ ] Multiple language support
- [ ] Voice activity detection
- [ ] Custom vocabulary training
- [ ] Integration with more AI providers
- [ ] Mobile app companion
- [ ] Advanced analytics dashboard
