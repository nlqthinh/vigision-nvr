from playhouse.migrate import *
from playhouse.sqlite_ext import SqliteExtDatabase

# Define the database and migrator
database = SqliteExtDatabase('config/vigision.db')  
migrator = SqliteMigrator(database)

# Define the new field
receive_alert_field = BooleanField(default=False)

# Run the migration
with database.transaction():
    migrate(
        migrator.add_column('user', 'receive_alert', receive_alert_field),
    )
