# Railway Deployment Guide

This guide will help you deploy the Flight Tracker app to Railway.

## Architecture

The app consists of two separate services:
- **Backend**: Flask API that ingests ADS-B data and serves flight information
- **Frontend**: React/Vite SPA that displays flight data

## Deployment Steps

### 1. Create Two Railway Services

You'll need to deploy the backend and frontend as **separate Railway services**.

#### Backend Service

1. In Railway, click **"New Project"** → **"Deploy from GitHub repo"**
2. Select your `overhead` repository
3. In the service settings:
   - **Root Directory**: `backend`
   - **Name**: `overhead-backend` (or any name you prefer)
4. Add environment variables:
   ```
   PORT=8080
   DB_PATH=/app/data/flight_log.db
   ```
5. Add a **volume** for persistent database storage:
   - **Mount Path**: `/app/data`
   - This ensures your flight database persists across deployments
6. Deploy! Railway will use the `backend/nixpacks.toml` config

#### Frontend Service

1. In the same Railway project, click **"New Service"** → **"GitHub repo"**
2. Select your `overhead` repository again
3. In the service settings:
   - **Root Directory**: `frontend`
   - **Name**: `overhead-frontend` (or any name you prefer)
4. Add environment variable:
   ```
   VITE_API_BASE=https://your-backend-service.railway.app
   ```
   Replace `your-backend-service.railway.app` with the actual URL of your backend service (you'll get this after the backend deploys)
5. Deploy! Railway will use the `frontend/nixpacks.toml` config

### 2. Configure CORS (Important!)

Since the frontend and backend are on different domains, you need to update the backend CORS settings:

In `backend/app/main.py`, update the CORS configuration to allow your frontend domain:

```python
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    # Replace with your actual frontend URL from Railway
    CORS(app, origins=["https://your-frontend-service.railway.app"])
    app.register_blueprint(api_bp)
    return app
```

Or for development, you can allow all origins (less secure):
```python
CORS(app, origins="*")
```

### 3. Database Migration

The backend will automatically:
- Create the database schema on first run (via `init_db()` in `wsgi.py`)
- Attempt to populate airports data from OpenFlights

If the airports migration fails, you can run it manually:
```bash
railway run python migrate_airports.py
```

### 4. Monitoring

- Backend logs: Check Railway logs for ingestion and classification activity
- Database: The SQLite database is stored in the mounted volume at `/app/data/flight_log.db`
- Health check: Visit `https://your-backend.railway.app/api/stats/summary` to verify the API is working

## Environment Variables Reference

### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port for the Flask server | `8080` |
| `DB_PATH` | Path to SQLite database | `/app/data/flight_log.db` |

### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE` | Backend API URL (no trailing slash) | `http://192.168.86.234:8080` |

## Troubleshooting

### "Error creating build plan with Railpack"
- Make sure you set the correct **Root Directory** for each service
- Backend should point to `backend/`
- Frontend should point to `frontend/`

### Backend not ingesting data
- Check that your Railway backend can access the ADS-B.lol API
- Verify the ingestion thread is running in the logs

### Frontend shows "Network Error"
- Check that `VITE_API_BASE` points to the correct backend URL
- Verify CORS is configured correctly in `backend/app/main.py`
- Make sure both services are deployed and running

### Database resets on deploy
- Ensure you've created a **volume** mounted at `/app/data` for the backend service
- Railway volumes persist data across deployments

## Cost Optimization

- **Hobby Plan**: Both services can run on Railway's hobby plan
- **Sleep Mode**: If inactive, Railway may sleep your services. Consider upgrading to prevent this for production use.
- **Database**: SQLite works well for this use case. For high traffic, consider PostgreSQL.

## Next Steps

After deployment:
1. Visit your frontend URL to see the live flight tracker
2. Check the Stats page to see accumulated flight data
3. Monitor the backend logs to verify data ingestion is working

## Support

For Railway-specific issues, check:
- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
