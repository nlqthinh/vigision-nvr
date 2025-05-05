from playhouse.migrate import *
from playhouse.sqlite_ext import SqliteExtDatabase

# Define the database and migrator
database = SqliteExtDatabase('config/vigision.db')  
migrator = SqliteMigrator(database)

# Define the new field
email_field = CharField(null=True, unique=True)

# Run the migration
with database.transaction():
    migrate(
        migrator.add_column('user', 'email', email_field),
    )
