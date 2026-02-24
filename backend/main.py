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
import logging
import uuid
import re
from pathlib import Path

from database import get_db, engine
from models import Base, Faculty, PeriodTiming, VideoUpload, Department, TimetableEntry, Admin, EngagementAnalysis
from drive_service import upload_to_drive, check_drive_connection

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_WHISPER_MODEL = None
_PYANNOTE_PIPELINE = None
_TRANSCRIBER_KIND = None

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
SECRET_KEY = os.environ.get("SECRET_KEY", "metaview-secret-key-change-in-production-2024")
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
    classes: Optional[List[str]] = None


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
    drive_url: Optional[str] = None


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


def parse_classes(value: Optional[str]) -> Optional[List[str]]:
    if not value:
        return None
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else None
    except (json.JSONDecodeError, TypeError):
        return None


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


def validate_video_timing(video_start_time: str, video_end_time: str, duration_seconds: int, db: Session, target_period: int = None) -> dict:
    """
    Validate if the video timing falls within a specific period timing.
    If target_period is provided, only validates against that period.
    Returns qualification status, matched period, and detailed timing info.
    """
    if target_period:
        period_timing = db.query(PeriodTiming).filter(PeriodTiming.period == target_period).first()
        if not period_timing:
            return {
                "is_qualified": False,
                "matched_period": None,
                "matched_period_time": None,
                "message": f"Period {target_period} not found in the system.",
                "timing_details": None
            }
        period_timings = [period_timing]
    else:
        period_timings = db.query(PeriodTiming).order_by(PeriodTiming.period).all()
    
    if not video_start_time:
        return {
            "is_qualified": False,
            "matched_period": None,
            "matched_period_time": None,
            "message": "Could not extract video creation time. Please ensure the video has metadata.",
            "timing_details": None
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
                "message": f"Could not parse video start time: {video_start_time}",
                "timing_details": None
            }
        
        # Convert from UTC to IST (Indian Standard Time = UTC + 5:30)
        IST_OFFSET = timedelta(hours=5, minutes=30)
        video_start = video_start + IST_OFFSET
        
        # Calculate video end time
        video_end = video_start + timedelta(seconds=duration_seconds)
        
        # Get just the time portion for comparison
        video_start_time_only = video_start.time()
        video_end_time_only = video_end.time()
        
        # Check against each period (or the specific target period)
        for period in period_timings:
            period_start = parse_time_string(period.start_time)
            period_end = parse_time_string(period.end_time)
            
            if period_start is None or period_end is None:
                continue
            
            period_start_time = period_start.time()
            period_end_time = period_end.time()
            
            # Calculate timing details
            video_start_minutes = video_start_time_only.hour * 60 + video_start_time_only.minute
            video_end_minutes = video_end_time_only.hour * 60 + video_end_time_only.minute
            period_start_minutes = period_start_time.hour * 60 + period_start_time.minute
            period_end_minutes = period_end_time.hour * 60 + period_end_time.minute
            
            start_delay_minutes = video_start_minutes - period_start_minutes
            end_diff_minutes = period_end_minutes - video_end_minutes
            
            timing_details = {
                "video_start": video_start.strftime("%I:%M:%S %p"),
                "video_end": video_end.strftime("%I:%M:%S %p"),
                "period_start": period.start_time,
                "period_end": period.end_time,
                "start_delay_minutes": start_delay_minutes,
                "end_difference_minutes": end_diff_minutes,
                "duration_minutes": int(duration_seconds / 60)
            }
            
            # Validation logic:
            # 1. Video must start at or after period start time
            # 2. Video must end at or before period end time
            # 3. Allow up to 15 minutes late start as "acceptable delay"
            
            is_within_period = (video_start_time_only >= period_start_time and 
                               video_end_time_only <= period_end_time)
            
            started_late_but_acceptable = (start_delay_minutes > 0 and start_delay_minutes <= 15 and 
                                           video_end_time_only <= period_end_time)
            
            started_very_late = start_delay_minutes > 15
            
            ended_after_period = video_end_time_only > period_end_time
            
            started_before_period = video_start_time_only < period_start_time
            
            if is_within_period:
                if start_delay_minutes == 0:
                    message = f"✅ QUALIFIED! Video started exactly on time at {video_start.strftime('%I:%M %p')} and ended at {video_end.strftime('%I:%M %p')} within Period {period.period} ({period.display_time})"
                else:
                    message = f"✅ QUALIFIED! Video started at {video_start.strftime('%I:%M %p')} ({start_delay_minutes} min after period start) and ended at {video_end.strftime('%I:%M %p')} within Period {period.period} ({period.display_time})"
                
                return {
                    "is_qualified": True,
                    "matched_period": period.period,
                    "matched_period_time": period.display_time,
                    "message": message,
                    "timing_details": timing_details
                }
            
            elif started_late_but_acceptable:
                message = f"✅ QUALIFIED (Late Start)! Video started {start_delay_minutes} minutes late at {video_start.strftime('%I:%M %p')} (Period starts at {period.start_time}). Ended at {video_end.strftime('%I:%M %p')} within Period {period.period}."
                
                return {
                    "is_qualified": True,
                    "matched_period": period.period,
                    "matched_period_time": period.display_time,
                    "message": message,
                    "timing_details": timing_details
                }
            
            elif started_very_late:
                message = f"❌ NOT QUALIFIED! Video started {start_delay_minutes} minutes late at {video_start.strftime('%I:%M %p')} (Period starts at {period.start_time}). Maximum allowed delay is 15 minutes."
                
                return {
                    "is_qualified": False,
                    "matched_period": period.period,
                    "matched_period_time": period.display_time,
                    "message": message,
                    "timing_details": timing_details
                }
            
            elif started_before_period:
                minutes_early = abs(start_delay_minutes)
                message = f"❌ NOT QUALIFIED! Video started {minutes_early} minutes BEFORE period start at {video_start.strftime('%I:%M %p')} (Period starts at {period.start_time})."
                
                return {
                    "is_qualified": False,
                    "matched_period": period.period,
                    "matched_period_time": period.display_time,
                    "message": message,
                    "timing_details": timing_details
                }
            
            elif ended_after_period:
                minutes_over = abs(end_diff_minutes)
                message = f"❌ NOT QUALIFIED! Video ended {minutes_over} minutes AFTER period end at {video_end.strftime('%I:%M %p')} (Period ends at {period.end_time})."
                
                return {
                    "is_qualified": False,
                    "matched_period": period.period,
                    "matched_period_time": period.display_time,
                    "message": message,
                    "timing_details": timing_details
                }
        
        # No match found
        return {
            "is_qualified": False,
            "matched_period": None,
            "matched_period_time": None,
            "message": f"❌ Video NOT QUALIFIED. Recording time ({video_start.strftime('%I:%M %p')} - {video_end.strftime('%I:%M %p')}) does not match any period timing.",
            "timing_details": None
        }
        
    except Exception as e:
        return {
            "is_qualified": False,
            "matched_period": None,
            "matched_period_time": None,
            "message": f"Error validating timing: {str(e)}",
            "timing_details": None
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
        phone=current_faculty.phone,
        classes=parse_classes(current_faculty.classes)
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
    period: int = Form(None),
    current_faculty: Faculty = Depends(get_current_faculty),
    db: Session = Depends(get_db)
):
    """
    Upload and analyze a video file.
    Extracts metadata and validates against the specified period timing.
    If period is provided, validates only against that specific period.
    """
    # Validate file type
    allowed_extensions = [".mp4", ".avi", ".mov", ".mkv", ".webm", ".wmv", ".flv"]
    file_ext = os.path.splitext(video.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_extensions)}"
        )
    
    content = await video.read()
    safe_name = os.path.basename(video.filename or f"video{file_ext}")
    uploads_dir = Path(__file__).resolve().parent / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid.uuid4()}__{safe_name}"
    stored_path = str((uploads_dir / stored_filename).resolve())
    with open(stored_path, "wb") as output_file:
        output_file.write(content)
    
    try:
        # Extract metadata
        metadata = extract_video_metadata(stored_path)
        
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
        # If period is specified, validate only against that period
        validation_result = validate_video_timing(video_start_time_utc, video_end_time, duration_seconds, db, target_period=period)
        
        # Upload to Google Drive (always upload regardless of qualification status)
        drive_url = None
        success, web_link, error = upload_to_drive(
            file_path=stored_path,
            filename=video.filename,
            faculty_name=current_faculty.name,
            period=validation_result["matched_period"]
        )
        if success:
            drive_url = web_link
            logger.info(f"Video uploaded to Drive: {web_link}")
        else:
            logger.warning(f"Failed to upload to Drive: {error}")
        
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
            validation_message=validation_result["message"],
            drive_url=drive_url
        )
        db.add(upload_record)
        db.commit()
        db.refresh(upload_record)

        try:
            ensure_local_engagement_for_upload(upload_record, db, video_path=stored_path, force_recompute=True)
        except Exception as engagement_error:
            logger.warning(f"Failed to create local engagement record: {engagement_error}")
        
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
            validation_message=validation_result["message"],
            drive_url=drive_url
        )
        
    finally:
        pass


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


@app.get("/api/video/today-status")
def get_today_upload_status(
    current_faculty: Faculty = Depends(get_current_faculty),
    db: Session = Depends(get_db)
):
    """Get today's upload status for each period the faculty teaches"""
    # Get today's date boundaries (12 AM to 12 AM IST)
    IST_OFFSET = timedelta(hours=5, minutes=30)
    now_utc = datetime.now(timezone.utc)
    now_ist = now_utc + IST_OFFSET
    
    # Today's start and end in IST
    today_start_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end_ist = today_start_ist + timedelta(days=1)
    
    # Convert back to UTC for database query
    today_start_utc = today_start_ist - IST_OFFSET
    today_end_utc = today_end_ist - IST_OFFSET
    
    # Get today's day name
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    today_day = days[now_ist.weekday()]
    
    # Get faculty's schedule for today
    timetable_entries = db.query(TimetableEntry).filter(
        TimetableEntry.faculty_id == current_faculty.id,
        TimetableEntry.day == today_day
    ).all()
    
    # Get all period timings (using 'period' column, not 'period_number')
    period_timings = {p.period: p for p in db.query(PeriodTiming).all()}
    
    # Get today's uploads for this faculty
    today_uploads = db.query(VideoUpload).filter(
        VideoUpload.faculty_id == current_faculty.id,
        VideoUpload.upload_date >= today_start_utc.replace(tzinfo=None),
        VideoUpload.upload_date < today_end_utc.replace(tzinfo=None)
    ).all()
    
    # Create a map of period -> upload
    uploads_by_period = {}
    for upload in today_uploads:
        if upload.matched_period:
            uploads_by_period[upload.matched_period] = {
                "id": upload.id,
                "filename": upload.filename,
                "is_qualified": upload.is_qualified,
                "upload_date": upload.upload_date.isoformat(),
                "validation_message": upload.validation_message
            }
    
    # Build response with faculty's today's periods
    periods_status = []
    for entry in timetable_entries:
        period = period_timings.get(entry.period)
        if period:
            upload = uploads_by_period.get(entry.period)
            # start_time and end_time are already strings like "08:00 AM"
            dept_name = entry.department.name if entry.department else "N/A"
            periods_status.append({
                "period": entry.period,
                "start_time": period.start_time,
                "end_time": period.end_time,
                "display_time": period.display_time or f"{period.start_time} - {period.end_time}",
                "subject": entry.subject,
                "class_type": entry.class_type,
                "department": dept_name,
                "uploaded": upload is not None,
                "upload_info": upload
            })
    
    # Sort by period number
    periods_status.sort(key=lambda x: x["period"])
    
    return {
        "date": now_ist.strftime("%Y-%m-%d"),
        "day": today_day,
        "faculty_name": current_faculty.name,
        "periods": periods_status
    }


@app.get("/api/faculties")
def list_faculties(db: Session = Depends(get_db)):
    """List all faculties (for testing)"""
    faculties = db.query(Faculty).all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "email": f.email,
            "department": f.department.code if f.department else None,
            "classes": parse_classes(f.classes)
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


class UpdateFacultyClassesRequest(BaseModel):
    classes: List[str]


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
    upload_id: Optional[int] = None
    upload_date: Optional[str] = None
    drive_url: Optional[str] = None
    is_qualified: Optional[bool] = None
    upload_filename: Optional[str] = None
    validation_message: Optional[str] = None


class TodayStatsResponse(BaseModel):
    total_classes: int
    faculty_with_uploads: int
    qualified_uploads: int
    pending_uploads: int


class TodayDataResponse(BaseModel):
    classes: List[TodayClassResponse]
    stats: TodayStatsResponse


def _load_whisper_model():
    global _TRANSCRIBER_KIND
    global _WHISPER_MODEL
    if _WHISPER_MODEL is not None:
        return _WHISPER_MODEL

    model_name = os.getenv("WHISPER_MODEL", "medium")

    try:
        from faster_whisper import WhisperModel
        _WHISPER_MODEL = WhisperModel(
            model_name,
            device=os.getenv("WHISPER_DEVICE", "cpu"),
            compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
        )
        _TRANSCRIBER_KIND = "faster-whisper"
        logger.info(f"Loaded faster-whisper model: {model_name}")
        return _WHISPER_MODEL
    except Exception as error:
        logger.warning(f"faster-whisper unavailable ({model_name}): {error}")

    try:
        import whisper
        _WHISPER_MODEL = whisper.load_model(model_name)
        _TRANSCRIBER_KIND = "openai-whisper"
        logger.info(f"Loaded openai-whisper model: {model_name}")
        return _WHISPER_MODEL
    except Exception as error:
        logger.warning(f"No Whisper model available ({model_name}): {error}")
        _WHISPER_MODEL = False
        _TRANSCRIBER_KIND = "none"
        return None


def _transcribe_audio(video_path: str) -> tuple[str, list]:
    model = _load_whisper_model()
    if not model:
        return "", []

    try:
        if _TRANSCRIBER_KIND == "faster-whisper":
            segment_iter, _ = model.transcribe(video_path, beam_size=5, vad_filter=True)
            segments = []
            text_parts = []
            for segment in segment_iter:
                seg_text = (segment.text or "").strip()
                if seg_text:
                    text_parts.append(seg_text)
                segments.append({
                    "start": float(segment.start),
                    "end": float(segment.end),
                    "text": seg_text,
                })
            return " ".join(text_parts).strip(), segments

        result = model.transcribe(video_path, verbose=False)
        transcript = (result.get("text") or "").strip()
        segments = result.get("segments") or []
        return transcript, segments
    except Exception as error:
        logger.warning(f"Transcription failed for {video_path}: {error}")
        return "", []


def _load_pyannote_pipeline():
    global _PYANNOTE_PIPELINE
    if _PYANNOTE_PIPELINE is not None:
        return _PYANNOTE_PIPELINE

    hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
    if not hf_token:
        _PYANNOTE_PIPELINE = False
        return None

    try:
        from pyannote.audio import Pipeline
        _PYANNOTE_PIPELINE = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
        logger.info("Loaded pyannote diarization pipeline")
        return _PYANNOTE_PIPELINE
    except Exception as error:
        logger.warning(f"pyannote pipeline unavailable: {error}")
        _PYANNOTE_PIPELINE = False
        return None


def _extractive_summary(transcript: str, sentence_count: int = 3) -> str:
    if not transcript:
        return "Transcript unavailable."

    sentences = re.split(r'(?<=[.!?])\s+', transcript.strip())
    sentences = [sentence.strip() for sentence in sentences if sentence.strip()]
    if not sentences:
        return transcript[:240]

    selected = sentences[:max(1, sentence_count)]
    return " ".join(selected)


def _detect_fillers_from_text(transcript: str) -> dict:
    patterns = {
        "um": r"\bum+\b",
        "uh": r"\buh+\b",
        "like": r"\blike\b",
        "you know": r"\byou\s+know\b",
        "basically": r"\bbasically\b",
        "actually": r"\bactually\b",
        "so": r"\bso\b",
        "right": r"\bright\b",
    }

    text = (transcript or "").lower()
    counts = {}
    for key, pattern in patterns.items():
        found = re.findall(pattern, text, flags=re.IGNORECASE)
        if found:
            counts[key] = len(found)
    return counts


def _detect_speaking_gaps(video_path: str) -> tuple[list, float]:
    try:
        import librosa

        y, sr = librosa.load(video_path, sr=16000, mono=True)
        if y is None or len(y) == 0:
            return [], 0.0

        intervals = librosa.effects.split(y, top_db=35)
        if len(intervals) == 0:
            return [], 0.0

        gaps = []
        total_gap = 0.0
        prev_end = intervals[0][1] / sr

        for idx in range(1, len(intervals)):
            cur_start = intervals[idx][0] / sr
            gap_duration = cur_start - prev_end
            if gap_duration >= 0.4:
                gap = {
                    "start": round(prev_end, 2),
                    "end": round(cur_start, 2),
                    "duration": round(gap_duration, 2)
                }
                gaps.append(gap)
                total_gap += gap_duration
            prev_end = intervals[idx][1] / sr

        return gaps, round(total_gap, 2)
    except Exception as error:
        logger.warning(f"Gap detection failed for {video_path}: {error}")
        return [], 0.0


def _detect_speakers(video_path: str, fallback_duration: int) -> tuple[int, list]:
    pipeline = _load_pyannote_pipeline()
    if not pipeline:
        return 1, [{
            "speaker": "Speaker 1 (Faculty)",
            "start": 0,
            "end": fallback_duration,
            "duration": fallback_duration,
            "percentage": 100.0,
        }]

    try:
        diarization = pipeline(video_path)
        speaker_durations = {}
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            dur = max(0.0, float(turn.end - turn.start))
            speaker_durations[speaker] = speaker_durations.get(speaker, 0.0) + dur

        total = sum(speaker_durations.values())
        if total <= 0:
            raise RuntimeError("No positive diarization duration")

        ordered = sorted(speaker_durations.items(), key=lambda item: item[1], reverse=True)
        segments = []
        offset = 0.0
        for index, (_, duration) in enumerate(ordered, start=1):
            percentage = (duration / total) * 100
            label = "Speaker 1 (Faculty)" if index == 1 else f"Speaker {index}"
            segments.append({
                "speaker": label,
                "start": round(offset, 2),
                "end": round(offset + duration, 2),
                "duration": round(duration, 2),
                "percentage": round(percentage, 2),
            })
            offset += duration

        return len(segments), segments
    except Exception as error:
        logger.warning(f"Speaker diarization failed for {video_path}: {error}")
        return 1, [{
            "speaker": "Speaker 1 (Faculty)",
            "start": 0,
            "end": fallback_duration,
            "duration": fallback_duration,
            "percentage": 100.0,
        }]


def _build_engagement_timeline(segments: list, duration_seconds: int, baseline: int) -> list:
    if duration_seconds <= 0:
        return [{"minute": 1, "score": baseline}]

    points = []
    total_minutes = max(1, int((duration_seconds + 59) // 60))
    for minute in range(1, total_minutes + 1):
        minute_start = (minute - 1) * 60
        minute_end = minute * 60

        minute_words = 0
        for segment in segments or []:
            segment_start = float(segment.get("start", 0))
            segment_end = float(segment.get("end", 0))
            text = (segment.get("text") or "").strip()
            if not text:
                continue

            overlap = max(0.0, min(segment_end, minute_end) - max(segment_start, minute_start))
            seg_dur = max(0.1, segment_end - segment_start)
            if overlap > 0:
                word_count = len(text.split())
                minute_words += (word_count * overlap / seg_dur)

        minute_score = _clamp_score((baseline * 0.65) + min(35, minute_words * 1.1))
        points.append({"minute": minute, "score": minute_score})

    return points


def _resolve_stored_video_path(filename: Optional[str]) -> Optional[str]:
    if not filename:
        return None

    uploads_dir = Path(__file__).resolve().parent / "uploads"
    if not uploads_dir.exists():
        return None

    candidates = list(uploads_dir.glob(f"*__{filename}"))
    if not candidates:
        return None

    candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return str(candidates[0].resolve())


def _clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def build_engagement_from_upload(upload: VideoUpload, video_path: Optional[str] = None) -> dict:
    duration_seconds = int(upload.duration_seconds or 0)
    if duration_seconds <= 0 and video_path and os.path.exists(video_path):
        try:
            metadata = extract_video_metadata(video_path) or {}
            duration_seconds = int(float(metadata.get("duration_seconds", 0) or 0))
        except Exception:
            duration_seconds = 0

    transcript = ""
    transcript_segments = []

    if video_path and os.path.exists(video_path):
        transcript, transcript_segments = _transcribe_audio(video_path)

    summary = _extractive_summary(transcript)
    filler_dict = _detect_fillers_from_text(transcript)
    filler_total = sum(filler_dict.values())

    gaps, total_gap_duration = ([], 0.0)
    if video_path and os.path.exists(video_path):
        gaps, total_gap_duration = _detect_speaking_gaps(video_path)

    speaker_count, speaker_segments = _detect_speakers(video_path, duration_seconds)

    total_words = len(transcript.split()) if transcript else 0
    effective_speaking_seconds = max(1.0, float(duration_seconds) - float(total_gap_duration))
    speaking_rate_wpm = int((total_words / effective_speaking_seconds) * 60) if total_words > 0 else 0

    if total_words == 0:
        engagement_score = 0
    else:
        filler_penalty = min(25, (filler_total / max(1, total_words)) * 200)
        gap_penalty = min(20, total_gap_duration / max(1, duration_seconds) * 100)
        speaking_rate_bonus = 10 if 100 <= speaking_rate_wpm <= 170 else 0
        engagement_score = _clamp_score(70 - filler_penalty - gap_penalty + speaking_rate_bonus)

    video_engagement_score = _clamp_score((engagement_score * 0.7) + (10 if upload.is_qualified else 0))
    combined_engagement_score = _clamp_score((engagement_score * 0.65) + (video_engagement_score * 0.35))

    if transcript:
        positive_markers = ["good", "great", "excellent", "clear", "understand", "important"]
        negative_markers = ["confuse", "problem", "difficult", "error", "wrong"]
        pos = sum(transcript.lower().count(token) for token in positive_markers)
        neg = sum(transcript.lower().count(token) for token in negative_markers)
        overall_sentiment = "positive" if pos >= neg else "neutral"
        emotional_tone = "active" if (total_words > 120 and speaking_rate_wpm > 110) else "moderate"
    else:
        overall_sentiment = "neutral"
        emotional_tone = "calm"

    turn_taking_frequency = round((max(0, speaker_count - 1) / max(1.0, duration_seconds / 60)), 2)
    timeline = _build_engagement_timeline(transcript_segments, duration_seconds, engagement_score)

    clarity_score = _clamp_score(75 - min(25, (filler_total / max(1, total_words)) * 180) - min(15, total_gap_duration)) if total_words else 0
    confidence_score = _clamp_score((combined_engagement_score * 0.8) + (10 if speaking_rate_wpm >= 100 else 0)) if total_words else 0

    return {
        "meeting_id": str(uuid.uuid4()),
        "engagement_score": engagement_score,
        "combined_engagement_score": combined_engagement_score,
        "overall_sentiment": overall_sentiment,
        "emotional_tone": emotional_tone,
        "turn_taking_frequency": turn_taking_frequency,
        "video_engagement_score": video_engagement_score,
        "video_file_name": upload.filename,
        "audio_file_name": upload.filename,
        "transcript": transcript,
        "summary": summary,
        "filler_words": json.dumps(filler_dict),
        "filler_word_total": filler_total,
        "speaking_gaps": json.dumps(gaps),
        "total_gaps": len(gaps),
        "total_gap_duration": float(total_gap_duration),
        "speaker_count": speaker_count,
        "speaker_segments": json.dumps(speaker_segments),
        "speaking_rate_wpm": speaking_rate_wpm,
        "total_words": total_words,
        "clarity_score": clarity_score,
        "confidence_score": confidence_score,
        "engagement_timeline": json.dumps(timeline),
    }


def ensure_local_engagement_for_upload(
    upload: VideoUpload,
    db: Session,
    video_path: Optional[str] = None,
    force_recompute: bool = False,
) -> EngagementAnalysis:
    existing = db.query(EngagementAnalysis).filter(
        EngagementAnalysis.video_upload_id == upload.id
    ).first()

    if existing and not force_recompute:
        return existing

    if existing and force_recompute:
        db.delete(existing)
        db.commit()

    payload = build_engagement_from_upload(upload, video_path=video_path)

    analysis = EngagementAnalysis(
        meeting_id=payload["meeting_id"],
        video_upload_id=upload.id,
        faculty_id=upload.faculty_id,
        video_file_name=payload["video_file_name"],
        audio_file_name=payload["audio_file_name"],
        engagement_score=payload["engagement_score"],
        combined_engagement_score=payload["combined_engagement_score"],
        overall_sentiment=payload["overall_sentiment"],
        emotional_tone=payload["emotional_tone"],
        turn_taking_frequency=str(payload["turn_taking_frequency"]),
        video_engagement_score=payload["video_engagement_score"],
        transcript=payload["transcript"],
        summary=payload["summary"],
        filler_words=payload["filler_words"],
        filler_word_total=payload["filler_word_total"],
        speaking_gaps=payload["speaking_gaps"],
        total_gaps=payload["total_gaps"],
        total_gap_duration=payload["total_gap_duration"],
        speaker_count=payload["speaker_count"],
        speaker_segments=payload["speaker_segments"],
        speaking_rate_wpm=payload["speaking_rate_wpm"],
        total_words=payload["total_words"],
        clarity_score=payload["clarity_score"],
        confidence_score=payload["confidence_score"],
        engagement_timeline=payload["engagement_timeline"],
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


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


@app.get("/api/admin/drive-status")
def get_drive_status(admin: Admin = Depends(get_current_admin)):
    """Check Google Drive connection status (admin only)"""
    is_connected, message = check_drive_connection()
    return {
        "connected": is_connected,
        "message": message
    }


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
            "classes": parse_classes(f.classes),
            "total_uploads": upload_count,
            "qualified_uploads": qualified_count,
            "not_qualified_uploads": upload_count - qualified_count
        })
    
    return result


@app.patch("/api/admin/faculties/{faculty_id}/classes")
def update_faculty_classes(
    faculty_id: int,
    payload: UpdateFacultyClassesRequest,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update classes assigned to a faculty member"""
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty not found")

    if not isinstance(payload.classes, list):
        raise HTTPException(status_code=400, detail="Classes must be a list")

    # Validate class codes
    valid_codes = {d.code for d in db.query(Department).all()}
    invalid = [code for code in payload.classes if code not in valid_codes]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid class codes: {', '.join(invalid)}")

    faculty.classes = json.dumps(payload.classes)

    # Optionally align department with the primary class
    if payload.classes:
        dept = db.query(Department).filter(Department.code == payload.classes[0]).first()
        if dept:
            faculty.department_id = dept.id

    db.commit()
    db.refresh(faculty)

    return {
        "id": faculty.id,
        "name": faculty.name,
        "email": faculty.email,
        "department": faculty.department.code if faculty.department else None,
        "phone": faculty.phone,
        "classes": parse_classes(faculty.classes)
    }


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
                
                department_code = None
                if schedule.faculty and schedule.faculty.department:
                    department_code = schedule.faculty.department.code
                elif schedule.department:
                    department_code = schedule.department.code
                else:
                    classes_list = parse_classes(schedule.faculty.classes) if schedule.faculty else None
                    department_code = classes_list[0] if classes_list else "N/A"

                class_data = TodayClassResponse(
                    period=schedule.period,
                    start_time=period_info.start_time,
                    end_time=period_info.end_time,
                    display_time=period_info.display_time,
                    faculty_id=schedule.faculty.id,
                    faculty_name=schedule.faculty.name,
                    department=department_code or "N/A",
                    has_upload=upload is not None,
                    upload_id=upload.id if upload else None,
                    upload_date=upload.upload_date.isoformat() if upload and upload.upload_date else None,
                    drive_url=upload.drive_url if upload else None,
                    is_qualified=upload.is_qualified if upload else None,
                    upload_filename=upload.filename if upload else None,
                    validation_message=upload.validation_message if upload else None
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


def _serialize_engagement(item: EngagementAnalysis) -> dict:
    """Serialize an EngagementAnalysis row to a JSON-safe dict."""
    import json as _json
    return {
        "meeting_id": item.meeting_id,
        "engagement_score": item.engagement_score,
        "combined_engagement_score": item.combined_engagement_score,
        "overall_sentiment": item.overall_sentiment,
        "emotional_tone": item.emotional_tone,
        "turn_taking_frequency": float(item.turn_taking_frequency or 0),
        "video_file_name": item.video_file_name,
        "audio_file_name": item.audio_file_name,
        "video_analysis": {
            "video_engagement_score": item.video_engagement_score
        },
        # Extended analysis
        "transcript": item.transcript,
        "summary": item.summary,
        "filler_words": _json.loads(item.filler_words) if item.filler_words else {},
        "filler_word_total": item.filler_word_total or 0,
        "speaking_gaps": _json.loads(item.speaking_gaps) if item.speaking_gaps else [],
        "total_gaps": item.total_gaps or 0,
        "total_gap_duration": item.total_gap_duration or 0.0,
        "speaker_count": item.speaker_count or 1,
        "speaker_segments": _json.loads(item.speaker_segments) if item.speaker_segments else [],
        "speaking_rate_wpm": item.speaking_rate_wpm or 0,
        "total_words": item.total_words or 0,
        "clarity_score": item.clarity_score or 0,
        "confidence_score": item.confidence_score or 0,
        "engagement_timeline": _json.loads(item.engagement_timeline) if item.engagement_timeline else [],
        "created_at": item.created_at.isoformat() if item.created_at else None
    }


@app.get("/api/engagement/all-analyses")
def get_all_engagement_analyses(
    page: int = 1,
    page_size: int = 100,
    faculty_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 10
    if page_size > 500:
        page_size = 500

    query = db.query(EngagementAnalysis)
    if faculty_id:
        query = query.filter(EngagementAnalysis.faculty_id == faculty_id)

    total = query.count()
    items = query.order_by(EngagementAnalysis.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    data = [_serialize_engagement(item) for item in items]

    return {
        "status": "success",
        "message": f"Retrieved {len(data)} analyses",
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 1
        }
    }


@app.get("/api/engagement/analysis/{meeting_id}")
def get_engagement_by_meeting_id(meeting_id: str, db: Session = Depends(get_db)):
    item = db.query(EngagementAnalysis).filter(EngagementAnalysis.meeting_id == meeting_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Engagement analysis not found")

    return {
        "status": "success",
        "data": _serialize_engagement(item)
    }


@app.post("/api/admin/engagement/backfill")
def backfill_engagement(
    force: bool = False,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Backfill engagement data. Use ?force=true to regenerate all records."""
    uploads = db.query(VideoUpload).all()
    created = 0

    if force:
        db.query(EngagementAnalysis).delete()
        db.commit()

    for upload in uploads:
        existing = db.query(EngagementAnalysis).filter(
            EngagementAnalysis.video_upload_id == upload.id
        ).first()
        if existing:
            continue

        local_video_path = _resolve_stored_video_path(upload.filename)
        ensure_local_engagement_for_upload(
            upload,
            db,
            video_path=local_video_path,
            force_recompute=False,
        )
        created += 1

    return {
        "status": "success",
        "message": "Engagement backfill complete",
        "total_uploads": len(uploads),
        "created": created
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
