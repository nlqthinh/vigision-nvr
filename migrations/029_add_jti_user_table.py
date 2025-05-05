"""Peewee migrations -- 029_add_jti_user_table.py.

Some examples (model - class or model name)::

    > Model = migrator.orm['model_name']            # Return model in current state by name

    > migrator.sql(sql)                             # Run custom SQL
    > migrator.python(func, *args, **kwargs)        # Run python code
    > migrator.create_model(Model)                  # Create a model (could be used as decorator)
    > migrator.remove_model(model, cascade=True)    # Remove a model
    > migrator.add_fields(model, **fields)          # Add fields to a model
    > migrator.change_fields(model, **fields)       # Change fields
    > migrator.remove_fields(model, *field_names, cascade=True)
    > migrator.rename_field(model, old_field_name, new_field_name)
    > migrator.rename_table(model, new_table_name)
    > migrator.add_index(model, *col_names, unique=False)
    > migrator.drop_index(model, *col_names)
    > migrator.add_not_null(model, *field_names)
    > migrator.drop_not_null(model, *field_names)
    > migrator.add_default(model, field_name, default)

"""

import peewee as pw
from playhouse.migrate import *
from vigision.models import User

def migrate(migrator, database, fake=False, **kwargs):
    # Add the 'token_jti' column if it doesn't exist
    token_jti_field = pw.CharField(null=True, unique=False)
    if not hasattr(User, 'token_jti'):
        migrator.add_fields(User, token_jti=token_jti_field)

def rollback(migrator, database, fake=False, **kwargs):
    # Remove the 'token_jti' column if exists
    if hasattr(User, 'token_jti'):
        migrator.remove_fields(User, 'token_jti')
