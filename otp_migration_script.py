from playhouse.sqlite_ext import SqliteExtDatabase
import peewee as pw
from datetime import datetime

# Define the database
database = SqliteExtDatabase('config/vigision.db')

# Define the new OTP table
class OTP(pw.Model):
    email = pw.CharField(max_length=254, null=False, unique=True, primary_key=True)
    otp = pw.CharField(max_length=6, null=False)
    created_at = pw.DateTimeField(default=datetime.utcnow)

    class Meta:
        database = database
        table_name = 'otp'

# Create the OTP table
with database:
    database.create_tables([OTP])
