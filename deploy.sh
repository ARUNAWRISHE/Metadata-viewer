#!/bin/bash

echo "🚀 Starting deployment with Backend on Render..."

# Backend is already deployed
echo "
✅ Backend Status: DEPLOYED
🔗 Backend URL: https://metadata-viewer-delta.vercel.app

📋 FRONTEND DEPLOYMENT STEPS:

🌐 STEP 1: Deploy Frontend (Netlify - Recommended)
1. Go to https://netlify.com/
2. Sign in with GitHub
3. Click 'Add new site' > 'Import an existing project'
4. Connect GitHub and select: ARUNAWRISHE/Metadata-viewer
5. Build settings:
   - Base directory: client
   - Build command: npm run build  
   - Publish directory: client/dist
6. Deploy site
7. In Site settings > Environment variables, add:
   - VITE_API_URL: https://metadata-viewer-delta.vercel.app

🌐 STEP 1B: Alternative - Deploy Frontend (Cloudflare Pages)  
1. Go to https://pages.cloudflare.com/
2. Click 'Create a project' > 'Connect to Git'
3. Select: ARUNAWRISHE/Metadata-viewer
4. Build settings:
   - Build command: cd client && npm ci && npm run build
   - Build output: client/dist
   - Root directory: / (empty)
5. Add environment variable:
   - VITE_API_URL: https://metadata-viewer-delta.vercel.app

🔄 STEP 3: Update Frontend Environment
1. Copy your Railway app URL
2. In Cloudflare Pages dashboard, update VITE_API_URL
3. Trigger redeploy

✅ Your app will be live at: https://metadata-viewer.pages.dev
"

echo "📦 All deployment files are ready in your repository!"
echo "📖 See DEPLOYMENT.md for detailed instructions"