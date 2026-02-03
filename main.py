from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
import os
import json
import subprocess
import tempfile

from database import get_db, engine
from models import Base, Faculty, PeriodTiming, VideoUpload, Department, TimetableEntry, Admin

# Create tables
Base.metadata.create_all(bind=engine)

# App initialization
app = FastAPI(title="MetaView API", description="Faculty Video Metadata Validation System")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
SECRET_KEY = "metaview-secret-key-change-in-production-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

security = HTTPBearer()


# Pydantic Models
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    faculty_id: int
    faculty_name: str
    department: str


class FacultyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    name: str
    email: str
    department: Optional[str]
    phone: Optional[str]


class VideoAnalysisResponse(BaseModel):
    filename: str
    file_size: int
    duration_seconds: int
    duration_formatted: str
    video_start_time: Optional[str]
    video_end_time: Optional[str]
    resolution: Optional[str]
    video_codec: Optional[str]
    audio_codec: Optional[str]
    is_qualified: bool
    matched_period: Optional[int]
    matched_period_time: Optional[str]
    validation_message: str


class PeriodTimingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    period: int
    start_time: str
    end_time: str
    display_time: str


class VideoHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    filename: str
    duration_seconds: Optional[int]
    video_start_time: Optional[str]
    video_end_time: Optional[str]
    upload_date: datetime
    is_qualified: bool
    matched_period: Optional[int]
    validation_message: Optional[str]


# Helper Functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_faculty(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        faculty_id: int = payload.get("faculty_id")
        if faculty_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if faculty is None:
        raise credentials_exception
    return faculty


def parse_time_string(time_str: str) -> datetime:
    """Parse time string like '08:00 AM' to datetime object"""
    today = datetime.now().date()
    try:
        time_obj = datetime.strptime(time_str.strip(), "%I:%M %p").time()
        return datetime.combine(today, time_obj)
    except ValueError:
        try:
            time_obj = datetime.strptime(time_str.strip(), "%H:%M").time()
            return datetime.combine(today, time_obj)
        except ValueError:
            return None


def format_duration(seconds: int) -> str:
    """Format seconds to human readable duration"""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


def extract_video_metadata(file_path: str) -> dict:
    """Extract video metadata using ffprobe"""
    try:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            return None
        
        data = json.loads(result.stdout)
        
        # Extract format info
        format_info = data.get("format", {})
        streams = data.get("streams", [])
        
        # Find video and audio streams
        video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
        audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})
        
        # Get duration
        duration = float(format_info.get("duration", 0))
        
        # Get creation time from tags
        tags = format_info.get("tags", {})
        creation_time = tags.get("creation_time") or tags.get("date") or None
        
        # Resolution
        width = video_stream.get("width", 0)
        height = video_stream.get("height", 0)
        resolution = f"{width}x{height}" if width and height else None
        
        return {
            "duration_seconds": int(duration),
            "creation_time": creation_time,
            "resolution": resolution,
            "video_codec": video_stream.get("codec_name"),
            "audio_codec": audio_stream.get("codec_name"),
            "file_size": int(format_info.get("size", 0))
        }
    except Exception as e:
        print(f"FFprobe error: {e}")
        return None


def validate_video_timing(video_start_time: str, video_end_time: str, duration_seconds: int, db: Session) -> dict:
    """
    Validate if the video timing falls within any period timing.
    Returns qualification status and matched period.
    """
    period_timings = db.query(PeriodTiming).order_by(PeriodTiming.period).all()
    
    if not video_start_time:
        return {
            "is_qualified": False,
            "matched_period": None,
            "matched_period_time": None,
            "message": "Could not extract video creation time. Please ensure the video has metadata."
        }
    
    try:
        # Parse video start time
        video_start = None
        for fmt in ["%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%I:%M %p"]:
            try:
                video_start = datetime.strptime(video_start_time, fmt)
                break
            except ValueError:
                continue
        
        if video_start is None:
            return {
                "is_qualified": False,
                "matched_period": None,
                "matched_period_time": None,
                "message": f"Could not parse video start time: {video_start_time}"
            }
        
        # Convert from UTC to IST (Indian Standard Time = UTC + 5:30)
        # Video metadata stores time in UTC, but period timings are in IST
        IST_OFFSET = timedelta(hours=5, minutes=30)
        video_start = video_start + IST_OFFSET
        
        # Calculate video end time
        video_end = video_start + timedelta(seconds=duration_seconds)
        
        # Get just the time portion for comparison
        video_start_time_only = video_start.time()
        video_end_time_only = video_end.time()
        
        # Check against each period
        for period in period_timings:
            period_start = parse_time_string(period.start_time)
            period_end = parse_time_string(period.end_time)
            
            if period_start is None or period_end is None:
                continue
            
            period_start_time = period_start.time()
            period_end_time = period_end.time()
            
            # Check if video timing overlaps with period timing
            # Video is qualified if it starts at or after period start AND ends at or before period end
            # OR if there's significant overlap (at least 50% of period duration)
            
            if video_start_time_only >= period_start_time and video_end_time_only <= period_end_time:
                return {
                    "is_qualified": True,
                    "matched_period": period.period,
                    "matched_period_time": period.display_time,
                    "message": f"✅ Video is QUALIFIED! Recording falls within Period {period.period} ({period.display_time})"
                }
            
            # Check for partial overlap (video starts within period)
            if period_start_time <= video_start_time_only <= period_end_time:
                return {
                    "is_qualified": True,
                    "matched_period": period.period,
                    "matched_period_time": period.display_time,
                    "message": f"✅ Video is QUALIFIED! Recording started during Period {period.period} ({period.display_time})"
                }
        
        # No match found
        return {
            "is_qualified": False,
            "matched_period": None,
            "matched_period_time": None,
            "message": f"❌ Video NOT QUALIFIED. Recording time ({video_start.strftime('%I:%M %p')} - {video_end.strftime('%I:%M %p')}) does not match any period timing."
        }
        
    except Exception as e:
        return {
            "is_qualified": False,
            "matched_period": None,
            "matched_period_time": None,
            "message": f"Error validating timing: {str(e)}"
        }


# API Endpoints

@app.get("/")
def root():
    return {"message": "MetaView API - Faculty Video Validation System", "version": "1.0"}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Faculty login endpoint"""
    faculty = db.query(Faculty).filter(Faculty.email == request.email).first()
    
    if not faculty:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check password (if set) or use email as default password for first login
    if faculty.password:
        if not verify_password(request.password, faculty.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
    else:
        # First time login - password should be the email itself or a default
        if request.password != faculty.email and request.password != "faculty123":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password. Default password is 'faculty123'"
            )
        # Set the password for future logins
        faculty.password = hash_password(request.password)
        db.commit()
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"faculty_id": faculty.id, "email": faculty.email},
        expires_delta=access_token_expires
    )
    
    dept_name = faculty.department.code if faculty.department else "N/A"
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        faculty_id=faculty.id,
        faculty_name=faculty.name,
        department=dept_name
    )


@app.get("/api/faculty/profile", response_model=FacultyResponse)
def get_faculty_profile(current_faculty: Faculty = Depends(get_current_faculty)):
    """Get current faculty profile"""
    return FacultyResponse(
        id=current_faculty.id,
        name=current_faculty.name,
        email=current_faculty.email,
        department=current_faculty.department.code if current_faculty.department else None,
        phone=current_faculty.phone
    )


@app.get("/api/periods", response_model=List[PeriodTimingResponse])
def get_period_timings(db: Session = Depends(get_db)):
    """Get all period timings"""
    periods = db.query(PeriodTiming).order_by(PeriodTiming.period).all()
    return periods


@app.get("/api/faculty/schedule")
def get_faculty_schedule(
    current_faculty: Faculty = Depends(get_current_faculty),
    db: Session = Depends(get_db)
):
    """Get the current faculty's timetable/schedule"""
    # Get all timetable entries for this faculty
    timetable_entries = db.query(TimetableEntry).filter(
        TimetableEntry.faculty_id == current_faculty.id
    ).all()
    
    # Get all period timings
    period_timings = db.query(PeriodTiming).order_by(PeriodTiming.period).all()
    
    # Organize by day and period
    schedule_by_day = {}
    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    
    for day in days_order:
        schedule_by_day[day] = []
    
    for entry in timetable_entries:
        if entry.day not in schedule_by_day:
            schedule_by_day[entry.day] = []
        
        # Find corresponding period timing
        period_info = next((p for p in period_timings if p.period == entry.period), None)
        
        schedule_by_day[entry.day].append({
            "period": entry.period,
            "start_time": period_info.start_time if period_info else "N/A",
            "end_time": period_info.end_time if period_info else "N/A",
            "display_time": period_info.display_time if period_info else "N/A",
            "subject": entry.subject,
            "class_type": entry.class_type,
            "department": entry.department.code if entry.department else "N/A"
        })
    
    # Sort periods within each day
    for day in schedule_by_day:
        schedule_by_day[day].sort(key=lambda x: x["period"])
    
    return {
        "faculty_id": current_faculty.id,
        "faculty_name": current_faculty.name,
        "department": current_faculty.department.code if current_faculty.department else "N/A",
        "schedule": schedule_by_day
    }


@app.post("/api/video/analyze", response_model=VideoAnalysisResponse)
async def analyze_video(
    video: UploadFile = File(...),
    current_faculty: Faculty = Depends(get_current_faculty),
    db: Session = Depends(get_db)
):
    """
    Upload and analyze a video file.
    Extracts metadata and validates against period timings.
    """
    # Validate file type
    allowed_extensions = [".mp4", ".avi", ".mov", ".mkv", ".webm", ".wmv", ".flv"]
    file_ext = os.path.splitext(video.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Save to temp file for analysis
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
        content = await video.read()
        tmp_file.write(content)
        tmp_path = tmp_file.name
    
    try:
        # Extract metadata
        metadata = extract_video_metadata(tmp_path)
        
        if metadata is None:
            # Fallback - use basic file info
            metadata = {
                "duration_seconds": 0,
                "creation_time": None,
                "resolution": None,
                "video_codec": None,
                "audio_codec": None,
                "file_size": len(content)
            }
        
        duration_seconds = metadata.get("duration_seconds", 0)
        video_start_time_utc = metadata.get("creation_time")
        
        # Convert UTC to IST for display
        IST_OFFSET = timedelta(hours=5, minutes=30)
        video_start_time = None
        video_end_time = None
        
        if video_start_time_utc and duration_seconds:
            try:
                for fmt in ["%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"]:
                    try:
                        start_dt_utc = datetime.strptime(video_start_time_utc, fmt)
                        # Convert to IST
                        start_dt_ist = start_dt_utc + IST_OFFSET
                        end_dt_ist = start_dt_ist + timedelta(seconds=duration_seconds)
                        video_start_time = start_dt_ist.strftime("%I:%M:%S %p IST")
                        video_end_time = end_dt_ist.strftime("%I:%M:%S %p IST")
                        break
                    except ValueError:
                        continue
            except:
                pass
        
        # Validate against period timings (pass UTC time, conversion happens inside)
        validation_result = validate_video_timing(video_start_time_utc, video_end_time, duration_seconds, db)
        
        # Save upload record
        upload_record = VideoUpload(
            faculty_id=current_faculty.id,
            filename=video.filename,
            file_size=metadata.get("file_size", len(content)),
            duration_seconds=duration_seconds,
            video_start_time=video_start_time,
            video_end_time=video_end_time,
            resolution=metadata.get("resolution"),
            video_codec=metadata.get("video_codec"),
            audio_codec=metadata.get("audio_codec"),
            is_qualified=validation_result["is_qualified"],
            matched_period=validation_result["matched_period"],
            validation_message=validation_result["message"]
        )
        db.add(upload_record)
        db.commit()
        
        return VideoAnalysisResponse(
            filename=video.filename,
            file_size=metadata.get("file_size", len(content)),
            duration_seconds=duration_seconds,
            duration_formatted=format_duration(duration_seconds),
            video_start_time=video_start_time,
            video_end_time=video_end_time,
            resolution=metadata.get("resolution"),
            video_codec=metadata.get("video_codec"),
            audio_codec=metadata.get("audio_codec"),
            is_qualified=validation_result["is_qualified"],
            matched_period=validation_result["matched_period"],
            matched_period_time=validation_result["matched_period_time"],
            validation_message=validation_result["message"]
        )
        
    finally:
        # Cleanup temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.get("/api/video/history", response_model=List[VideoHistoryResponse])
def get_video_history(
    current_faculty: Faculty = Depends(get_current_faculty),
    db: Session = Depends(get_db)
):
    """Get faculty's video upload history"""
    uploads = db.query(VideoUpload).filter(
        VideoUpload.faculty_id == current_faculty.id
    ).order_by(VideoUpload.upload_date.desc()).all()
    
    return uploads


@app.get("/api/faculties")
def list_faculties(db: Session = Depends(get_db)):
    """List all faculties (for testing)"""
    faculties = db.query(Faculty).all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "email": f.email,
            "department": f.department.code if f.department else None
        }
        for f in faculties
    ]


# ======================= ADMIN ENDPOINTS =======================

class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str
    admin_id: int
    username: str
    role: str


class AdminUploadSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    filename: str
    file_size: Optional[int]
    duration_seconds: Optional[int]
    video_start_time: Optional[str]
    video_end_time: Optional[str]
    resolution: Optional[str]
    upload_date: datetime
    is_qualified: bool
    matched_period: Optional[int]
    validation_message: Optional[str]
    faculty_id: int
    faculty_name: str
    faculty_email: str
    department: Optional[str]


class DashboardStats(BaseModel):
    total_uploads: int
    qualified_uploads: int
    not_qualified_uploads: int
    total_faculties: int
    active_faculties: int
    qualification_rate: float


class TodayClassResponse(BaseModel):
    period: int
    start_time: str
    end_time: str
    display_time: str
    faculty_id: int
    faculty_name: str
    department: str
    has_upload: bool
    is_qualified: Optional[bool] = None
    upload_filename: Optional[str] = None


class TodayStatsResponse(BaseModel):
    total_classes: int
    faculty_with_uploads: int
    qualified_uploads: int
    pending_uploads: int


class TodayDataResponse(BaseModel):
    classes: List[TodayClassResponse]
    stats: TodayStatsResponse


def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Verify admin JWT token"""
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        admin_id: int = payload.get("admin_id")
        role: str = payload.get("role")
        if admin_id is None or role != "admin":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    admin = db.query(Admin).filter(Admin.id == admin_id).first()
    if admin is None:
        raise credentials_exception
    return admin


@app.post("/api/admin/login", response_model=AdminTokenResponse)
def admin_login(request: AdminLoginRequest, db: Session = Depends(get_db)):
    """Admin login endpoint"""
    admin = db.query(Admin).filter(Admin.username == request.username).first()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    # Verify password
    if not verify_password(request.password, admin.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"admin_id": admin.id, "username": admin.username, "role": "admin"},
        expires_delta=access_token_expires
    )
    
    return AdminTokenResponse(
        access_token=access_token,
        token_type="bearer",
        admin_id=admin.id,
        username=admin.username,
        role="admin"
    )


@app.get("/api/admin/dashboard", response_model=DashboardStats)
def get_admin_dashboard(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Get dashboard statistics for admin"""
    total_uploads = db.query(VideoUpload).count()
    qualified_uploads = db.query(VideoUpload).filter(VideoUpload.is_qualified == True).count()
    not_qualified_uploads = total_uploads - qualified_uploads
    total_faculties = db.query(Faculty).count()
    
    # Active faculties = those who have uploaded at least one video
    active_faculties = db.query(VideoUpload.faculty_id).distinct().count()
    
    qualification_rate = (qualified_uploads / total_uploads * 100) if total_uploads > 0 else 0
    
    return DashboardStats(
        total_uploads=total_uploads,
        qualified_uploads=qualified_uploads,
        not_qualified_uploads=not_qualified_uploads,
        total_faculties=total_faculties,
        active_faculties=active_faculties,
        qualification_rate=round(qualification_rate, 1)
    )


@app.get("/api/admin/uploads", response_model=List[AdminUploadSummary])
def get_all_uploads(
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
    status_filter: Optional[str] = None,
    faculty_id: Optional[int] = None,
    department: Optional[str] = None
):
    """Get all video uploads with faculty details"""
    query = db.query(VideoUpload).join(Faculty)
    
    if status_filter == "qualified":
        query = query.filter(VideoUpload.is_qualified == True)
    elif status_filter == "not_qualified":
        query = query.filter(VideoUpload.is_qualified == False)
    
    if faculty_id:
        query = query.filter(VideoUpload.faculty_id == faculty_id)
    
    if department:
        query = query.join(Department).filter(Department.code == department)
    
    uploads = query.order_by(VideoUpload.upload_date.desc()).all()
    
    result = []
    for upload in uploads:
        faculty = upload.faculty
        result.append(AdminUploadSummary(
            id=upload.id,
            filename=upload.filename,
            file_size=upload.file_size,
            duration_seconds=upload.duration_seconds,
            video_start_time=upload.video_start_time,
            video_end_time=upload.video_end_time,
            resolution=upload.resolution,
            upload_date=upload.upload_date,
            is_qualified=upload.is_qualified,
            matched_period=upload.matched_period,
            validation_message=upload.validation_message,
            faculty_id=faculty.id,
            faculty_name=faculty.name,
            faculty_email=faculty.email,
            department=faculty.department.code if faculty.department else None
        ))
    
    return result


@app.get("/api/admin/faculties")
def get_admin_faculties(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Get all faculties with their upload stats"""
    faculties = db.query(Faculty).all()
    
    result = []
    for f in faculties:
        upload_count = db.query(VideoUpload).filter(VideoUpload.faculty_id == f.id).count()
        qualified_count = db.query(VideoUpload).filter(
            VideoUpload.faculty_id == f.id,
            VideoUpload.is_qualified == True
        ).count()
        
        result.append({
            "id": f.id,
            "name": f.name,
            "email": f.email,
            "department": f.department.code if f.department else None,
            "phone": f.phone,
            "total_uploads": upload_count,
            "qualified_uploads": qualified_count,
            "not_qualified_uploads": upload_count - qualified_count
        })
    
    return result


@app.get("/api/admin/departments")
def get_departments(db: Session = Depends(get_db)):
    """Get all departments"""
    departments = db.query(Department).all()
    return [{"id": d.id, "name": d.name, "code": d.code} for d in departments]


@app.get("/api/admin/today-classes", response_model=TodayDataResponse)
def get_today_classes(
    date: str,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get today's classes with faculty upload status"""
    try:
        # Parse the date
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
        
        # Get day of the week (Monday, Tuesday, etc.)
        day_name = target_date.strftime('%A')
        
        # Get today's scheduled classes from timetable
        scheduled_classes = db.query(TimetableEntry).filter(
            TimetableEntry.day == day_name
        ).order_by(TimetableEntry.period).all()
        
        # Get today's uploads
        today_uploads = db.query(VideoUpload).filter(
            VideoUpload.upload_date >= target_date,
            VideoUpload.upload_date < target_date + timedelta(days=1)
        ).all()
        
        # Create a map of faculty uploads for today
        upload_map = {}
        for upload in today_uploads:
            key = f"{upload.faculty_id}_{upload.matched_period}"
            upload_map[key] = upload
        
        # Get period timings
        periods = {p.period: p for p in db.query(PeriodTiming).all()}
        
        # Build today's classes based on actual schedule
        today_classes = []
        for schedule in scheduled_classes:
            if schedule.faculty_id and schedule.period in periods:
                period_info = periods[schedule.period]
                key = f"{schedule.faculty_id}_{schedule.period}"
                upload = upload_map.get(key)
                
                class_data = TodayClassResponse(
                    period=schedule.period,
                    start_time=period_info.start_time,
                    end_time=period_info.end_time,
                    display_time=period_info.display_time,
                    faculty_id=schedule.faculty.id,
                    faculty_name=schedule.faculty.name,
                    department=schedule.faculty.department.code if schedule.faculty.department else "N/A",
                    has_upload=upload is not None,
                    is_qualified=upload.is_qualified if upload else None,
                    upload_filename=upload.filename if upload else None
                )
                today_classes.append(class_data)
        
        # Calculate stats based on actual scheduled classes
        total_classes = len(scheduled_classes)
        faculty_with_uploads = len(set(upload.faculty_id for upload in today_uploads))
        qualified_uploads = sum(1 for upload in today_uploads if upload.is_qualified)
        pending_uploads = total_classes - len(today_uploads)
        
        stats = TodayStatsResponse(
            total_classes=total_classes,
            faculty_with_uploads=faculty_with_uploads,
            qualified_uploads=qualified_uploads,
            pending_uploads=pending_uploads
        )
        
        return TodayDataResponse(classes=today_classes, stats=stats)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch today's data: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
