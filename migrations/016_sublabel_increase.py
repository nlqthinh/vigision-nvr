import peewee as pw

from vigision.models import Event


def migrate(migrator, database, fake=False, **kwargs):
    migrator.change_columns(Event, sub_label=pw.CharField(max_length=100, null=True))


def rollback(migrator, database, fake=False, **kwargs):
    migrator.change_columns(Event, sub_label=pw.CharField(max_length=20, null=True))
