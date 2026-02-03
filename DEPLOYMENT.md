# Deployment Guide

## Frontend Deployment (Cloudflare Pages)

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

## Backend Deployment (Railway)

### Step 1: Deploy to Railway
1. Go to [Railway](https://railway.app/)
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository: `ARUNAWRISHE/Metadata-viewer`
6. Railway will automatically detect it's a Python project

### Step 2: Configure Railway
1. In Railway dashboard, go to your project
2. Go to Settings > Environment Variables and add:
   - `PORT`: `8000`
   - `PYTHONPATH`: `/app`
3. Go to Settings > Deploy and set:
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Build Command**: `pip install -r requirements.txt`

### Step 3: Update Frontend Environment Variable
1. Copy your Railway app URL (e.g., `https://metadata-viewer-production.up.railway.app`)
2. Go back to Cloudflare Pages dashboard
3. Update the `VITE_API_URL` environment variable with your Railway URL
4. Redeploy the frontend

## Alternative Backend Deployment (Render)

If you prefer Render over Railway:

1. Go to [Render](https://render.com/)
2. Connect your GitHub account
3. Click "New +" > "Web Service"
4. Connect your repository
5. Configure:
   - **Name**: `metadata-viewer-api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

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