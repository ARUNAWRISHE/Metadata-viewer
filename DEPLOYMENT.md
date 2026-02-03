# Deployment Guide

## Frontend Deployment Options

### Option 1: Netlify (Recommended)

#### Step 1: Deploy to Netlify
1. Go to [Netlify](https://netlify.com/)
2. Sign up/Sign in with GitHub
3. Click "Add new site" → "Import an existing project"
4. Connect to Git provider → Select GitHub
5. Choose your repository: `ARUNAWRISHE/Metadata-viewer`
6. Configure build settings:
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/dist`
7. Click "Deploy site"

#### Step 2: Configure Environment Variables
1. In Netlify dashboard, go to Site settings → Environment variables
2. Add: **`VITE_API_URL = https://web-production-3d986.up.railway.app`**
3. Redeploy the site

### Option 2: Cloudflare Pages

### Step 1: Prepare Repository
1. Commit and push all changes to GitHub
2. Make sure your repository is public or accessible to Cloudflare

### Step 2: Deploy to Cloudflare Pages
1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Sign in with your Cloudflare account
3. Click "Create a project"
4. Select "Connect to Git"
5. Choose your GitHub repository: `ARUNAWRISHE/Metadata-viewer`
6. Configure build settings:
   - **Build command**: `cd client && npm ci && npm run build`
   - **Build output directory**: `client/dist`
   - **Root directory**: `/` (leave empty)
   - **Node.js version**: `18`

### Step 3: Environment Variables
In Cloudflare Pages dashboard, go to Settings > Environment Variables:
- **Variable name**: `VITE_API_URL`
- **Value**: Your backend API URL (see backend deployment below)

## Backend Deployment (Railway - Updated)

### Step 1: Create Railway Workspace
1. Go to [Railway](https://railway.app/)
2. Sign in with GitHub
3. Click "New Project" 
4. If prompted for workspace, click "Create New Workspace"
5. Name your workspace (e.g., "metadata-viewer-workspace")

### Step 2: Deploy to Railway
1. In your workspace, click "New Project"
2. Select "Deploy from GitHub repo" 
3. Choose your repository: `ARUNAWRISHE/Metadata-viewer`
4. Railway will automatically detect it's a Python project

### Step 3: Configure Railway
1. In Railway dashboard, click on your service
2. Go to "Variables" tab and add:
   - `PORT`: `8000` 
   - `PYTHONPATH`: `/app`
3. Go to "Settings" tab:
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Root Directory**: Leave empty (uses repository root)

### Step 3: Update Frontend Environment Variable
1. Copy your Railway app URL (e.g., `https://metadata-viewer-production.up.railway.app`)
2. Go back to Cloudflare Pages dashboard
3. Update the `VITE_API_URL` environment variable with your Railway URL
4. Redeploy the frontend

## Alternative Backend Deployment Options

### Option 1: Render (Recommended Free Alternative)

1. Go to [Render](https://render.com/)
2. Sign up/Sign in with GitHub
3. Click "New +" → "Web Service"
4. Connect your GitHub repository: `ARUNAWRISHE/Metadata-viewer`
5. Configure:
   - **Name**: `metadata-viewer-api`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Free
6. Click "Create Web Service"

### Option 2: Vercel (Serverless Functions)

1. Go to [Vercel](https://vercel.com/)
2. Import your GitHub repository
3. Create `vercel.json` in root:
```json
{
  "functions": {
    "main.py": {
      "runtime": "python3.9"
    }
  },
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/main.py"
    }
  ]
}
```

### Option 3: Heroku (Paid)

1. Create `Procfile` in root:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```
2. Deploy via Heroku CLI or GitHub integration

## Database Considerations

**Important**: SQLite databases are not persistent in cloud deployments. Consider:

1. **For Production**: Migrate to PostgreSQL
2. **For Demo**: Use the included SQLite (data will reset on deploys)

### PostgreSQL Migration (Optional)
Update `database.py` to use PostgreSQL:
```python
# For production with PostgreSQL
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./metadata.db")
```

Then add to Railway/Render environment variables:
- `DATABASE_URL`: `postgresql://user:password@host:port/dbname`