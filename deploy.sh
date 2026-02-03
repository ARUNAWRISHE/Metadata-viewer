#!/bin/bash

echo "🚀 Starting deployment to Cloudflare Pages..."

# Step 1: Backend Deployment Instructions
echo "
📋 DEPLOYMENT STEPS:

🔧 STEP 1A: Deploy Backend (Railway - Updated)
1. Go to https://railway.app/
2. Sign in with GitHub  
3. Create a new workspace if prompted
4. Click 'New Project' > 'Deploy from GitHub repo'
5. Select: ARUNAWRISHE/Metadata-viewer
6. In Variables tab, set: PORT = 8000
7. Railway will auto-deploy from main branch

🔧 STEP 1B: Alternative - Deploy Backend (Render - Recommended)
1. Go to https://render.com/
2. Sign up with GitHub
3. Click 'New +' > 'Web Service'  
4. Connect: ARUNAWRISHE/Metadata-viewer
5. Settings:
   - Runtime: Python 3
   - Build: pip install -r requirements.txt
   - Start: uvicorn main:app --host 0.0.0.0 --port $PORT
   - Instance: Free tier

🌐 STEP 2: Deploy Frontend (Cloudflare Pages)  
1. Go to https://pages.cloudflare.com/
2. Click 'Create a project' > 'Connect to Git'
3. Select: ARUNAWRISHE/Metadata-viewer
4. Build settings:
   - Build command: cd client && npm ci && npm run build
   - Build output: client/dist
   - Root directory: / (empty)
5. Add environment variable:
   - VITE_API_URL: [Your Railway backend URL]

🔄 STEP 3: Update Frontend Environment
1. Copy your Railway app URL
2. In Cloudflare Pages dashboard, update VITE_API_URL
3. Trigger redeploy

✅ Your app will be live at: https://metadata-viewer.pages.dev
"

echo "📦 All deployment files are ready in your repository!"
echo "📖 See DEPLOYMENT.md for detailed instructions"