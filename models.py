from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Department(Base):
    __tablename__ = "departments"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    
    faculties = relationship("Faculty", back_populates="department")
    timetable_entries = relationship("TimetableEntry", back_populates="department")


class Faculty(Base):
    __tablename__ = "faculties"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password = Column(String(255), nullable=True)  # Hashed password
    phone = Column(String(20))
    department_id = Column(Integer, ForeignKey("departments.id"))
    image = Column(String(255))
    linkedin = Column(String(255))
    github = Column(String(255))
    experience = Column(String(50))
    c_exp = Column(String(50))
    py_exp = Column(String(50))
    research = Column(String(255))
    personal_email = Column(String(100))
    classes = Column(Text)
    
    department = relationship("Department", back_populates="faculties")
    timetable_entries = relationship("TimetableEntry", back_populates="faculty")
    video_uploads = relationship("VideoUpload", back_populates="faculty")


class Admin(Base):
    __tablename__ = "admins"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False)
    password = Column(String(255), nullable=False)


class PeriodTiming(Base):
    __tablename__ = "period_timings"
    
    id = Column(Integer, primary_key=True, index=True)
    period = Column(Integer, unique=True, nullable=False)
    start_time = Column(String(20), nullable=False)  # "08:00 AM"
    end_time = Column(String(20), nullable=False)    # "08:45 AM"
    display_time = Column(String(50))                # "08:00 AM - 08:45 AM"


class TimetableEntry(Base):
    __tablename__ = "timetable_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    day = Column(String(20), nullable=False)  # Monday, Tuesday, etc.
    period = Column(Integer, nullable=False)
    subject = Column(String(100))
    class_type = Column(String(20))  # theory, lab, mini_project
    faculty_id = Column(Integer, ForeignKey("faculties.id"))
    department_id = Column(Integer, ForeignKey("departments.id"))
    
    faculty = relationship("Faculty", back_populates="timetable_entries")
    department = relationship("Department", back_populates="timetable_entries")


class Syllabus(Base):
    __tablename__ = "syllabus"
    
    id = Column(Integer, primary_key=True, index=True)
    session_number = Column(Integer, nullable=False)
    session_title = Column(String(200), nullable=False)
    unit = Column(Integer, nullable=False)
    topics = Column(Text)
    ppt_url = Column(String(255))


class LabProgram(Base):
    __tablename__ = "lab_programs"
    
    id = Column(Integer, primary_key=True, index=True)
    program_number = Column(Integer, nullable=False)
    program_title = Column(String(200), nullable=False)
    description = Column(Text)
    moodle_url = Column(String(255))


class VideoUpload(Base):
    __tablename__ = "video_uploads"
    
    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(Integer, ForeignKey("faculties.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_size = Column(Integer)
    duration_seconds = Column(Integer)  # Duration in seconds
    video_start_time = Column(String(50))  # Creation/recording start time
    video_end_time = Column(String(50))    # Calculated end time
    resolution = Column(String(50))
    video_codec = Column(String(50))
    audio_codec = Column(String(50))
    upload_date = Column(DateTime, default=datetime.utcnow)
    is_qualified = Column(Boolean, default=False)
    matched_period = Column(Integer)  # Which period it matched
    validation_message = Column(Text)
    drive_url = Column(String(500))  # Google Drive shareable link
    
    faculty = relationship("Faculty", back_populates="video_uploads")


class EngagementAnalysis(Base):
    __tablename__ = "engagement_analyses"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(String(100), unique=True, nullable=False, index=True)
    video_upload_id = Column(Integer, ForeignKey("video_uploads.id"), nullable=False, index=True)
    faculty_id = Column(Integer, ForeignKey("faculties.id"), nullable=False, index=True)
    video_file_name = Column(String(255), nullable=True)
    audio_file_name = Column(String(255), nullable=True)

    engagement_score = Column(Integer, default=0)
    combined_engagement_score = Column(Integer, default=0)
    overall_sentiment = Column(String(50), default="neutral")
    emotional_tone = Column(String(50), default="calm")
    turn_taking_frequency = Column(String(20), default="0")
    video_engagement_score = Column(Integer, default=0)

    # --- Extended analysis fields ---
    transcript = Column(Text, nullable=True)          # Full transcript / caption
    summary = Column(Text, nullable=True)             # Short summary of the lecture
    filler_words = Column(Text, nullable=True)        # JSON: {"um": 12, "uh": 8, ...}
    filler_word_total = Column(Integer, default=0)
    speaking_gaps = Column(Text, nullable=True)        # JSON: [{"start":10.2,"end":12.5,"duration":2.3}, ...]
    total_gaps = Column(Integer, default=0)
    total_gap_duration = Column(Float, default=0.0)    # seconds
    speaker_count = Column(Integer, default=1)
    speaker_segments = Column(Text, nullable=True)     # JSON: [{"speaker":"Speaker 1","start":0,"end":120,"duration":120}, ...]
    speaking_rate_wpm = Column(Integer, default=0)     # words per minute
    total_words = Column(Integer, default=0)
    clarity_score = Column(Integer, default=0)         # 0-100
    confidence_score = Column(Integer, default=0)      # 0-100
    engagement_timeline = Column(Text, nullable=True)  # JSON: [{"minute":1,"score":72}, ...]

    created_at = Column(DateTime, default=datetime.utcnow)

    faculty = relationship("Faculty")
    video_upload = relationship("VideoUpload")
