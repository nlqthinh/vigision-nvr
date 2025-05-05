"""Peewee migrations -- 027_create_otp_table.py."""

import peewee as pw
from datetime import datetime

SQL = pw.SQL


def migrate(migrator, database, fake=False, **kwargs):
    # Create the OTP table if it doesn't exist
    migrator.sql("""
    CREATE TABLE IF NOT EXISTS otp (
        email VARCHAR(254) NOT NULL UNIQUE,
        otp CHAR(6) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)


def rollback(migrator, database, fake=False, **kwargs):
    # Drop the OTP table if it exists
    migrator.sql("DROP TABLE IF EXISTS otp")