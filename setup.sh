#!/bin/bash

# Voice Transcription App Setup Script
echo "🎤 Setting up Voice Transcription & Summarization Web App..."

# Check if Ruby is installed
if ! command -v ruby &> /dev/null; then
    echo "❌ Ruby is not installed. Please install Ruby 3.3.0 or higher."
    exit 1
fi

# Check if Rails is installed
if ! command -v rails &> /dev/null; then
    echo "❌ Rails is not installed. Please install Rails 8.0.2 or higher."
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready &> /dev/null; then
    echo "⚠️ PostgreSQL is not running. Please start PostgreSQL service."
    echo "  - macOS: brew services start postgresql"
    echo "  - Ubuntu: sudo service postgresql start"
    exit 1
fi

# Check if Redis is running
if ! redis-cli ping &> /dev/null; then
    echo "⚠️ Redis is not running. Please start Redis service."
    echo "  - macOS: brew services start redis"
    echo "  - Ubuntu: sudo service redis-server start"
    exit 1
fi

echo "✅ Dependencies check passed!"

# Install Ruby gems
echo "📦 Installing Ruby gems..."
bundle install

# Install Node packages
echo "🔧 Installing Node.js packages..."
yarn install

# Setup database
echo "🗃️ Setting up database..."
rails db:create
rails db:migrate

# Compile assets
echo "🎨 Compiling assets..."
yarn build:css

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚙️ Creating .env file from template..."
    cp .env .env.local
    echo "📝 Please edit .env.local with your API keys:"
    echo "  - DEEPGRAM_API_KEY or OPENAI_API_KEY for speech-to-text"
    echo "  - OPENAI_SUMMARIZATION_API_KEY for AI summaries"
fi

echo ""
echo "🎉 Setup complete! To start the application:"
echo ""
echo "  ./bin/dev"
echo ""
echo "Then visit http://localhost:3000 in your browser."
echo ""
echo "📚 Don't forget to configure your API keys in .env.local"
echo "🔗 See README.md for detailed configuration instructions."