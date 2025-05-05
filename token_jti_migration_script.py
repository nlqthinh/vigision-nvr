from playhouse.migrate import *
from playhouse.sqlite_ext import SqliteExtDatabase

# Define the database and migrator
database = SqliteExtDatabase('config/vigision.db')  
migrator = SqliteMigrator(database)

# Define the new field
token_jti_field = CharField(null=True, unique=False)

# Run the migration
with database.transaction():
    migrate(
        migrator.add_column('user', 'token_jti', token_jti_field),
    )
