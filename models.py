from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
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
    
    faculty = relationship("Faculty", back_populates="video_uploads")
