#!/bin/bash

# Spend4Good Backend - Quick Start Script

echo "🚀 Spend4Good Backend Setup"
echo "=============================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Please copy .env.example to .env and fill in your credentials"
    exit 1
fi

echo "✅ .env file found"
echo ""

# Check if required env vars are set
if grep -q "your_anon_key_here" .env; then
    echo "⚠️  WARNING: Supabase keys not configured in .env"
    echo "   Go to: https://supabase.com/dashboard/project/rpkivjzkgmfwnitjdmcv/settings/api"
    echo "   Copy the API keys and update .env file"
    echo ""
fi

if grep -q "+1234567890" .env; then
    echo "⚠️  WARNING: Twilio phone numbers not configured in .env"
    echo "   Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
    echo "   Copy your phone numbers and update .env file"
    echo ""
fi

echo "🎯 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with Supabase API keys"
echo "2. Update .env with Twilio phone numbers"
echo "3. Run: npm run dev"
echo "4. Open another terminal and run: ngrok http 3000"
echo "5. Update Twilio webhook with ngrok URL"
echo ""
echo "Happy coding! 🚀"
